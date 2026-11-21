import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { ConversationSchema } from "@property-assistant/contracts";
import pg from "pg";
import { createConversation, pool, resetDatabase, sendMessage, testApp, type TestApp } from "./helpers.js";

const CHAT_SECRET = "test-chat-ticket-secret";

function chatTicket(subject: string, secret = CHAT_SECRET): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({ iss: "catalog", aud: "property-assistant", scope: "chat_identity", sub: subject, exp: Math.floor(Date.now() / 1000) + 300 });
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
}

const auth = (subject: string) => ({ authorization: `Bearer ${chatTicket(subject)}` });

describe("health", () => {
    let app: TestApp;
    before(() => (app = testApp({ chatAuthSecret: CHAT_SECRET })));
    after(() => app.close());

    it("GET /health is a liveness check", async () => {
        const res = await app.inject("/health");
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { status: "ok", service: "property-assistant" });
    });

    it("GET /ready checks PostgreSQL", async () => {
        const res = await app.inject("/ready");
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { status: "ready", checks: { database: "ok" } });
    });

    it("GET /ready returns 503 when PostgreSQL is unreachable", async () => {
        const unreachable = new pg.Pool({ host: "127.0.0.1", port: 1, connectionTimeoutMillis: 500 });
        const broken = testApp({ db: unreachable });
        try {
            const res = await broken.inject("/ready");
            assert.equal(res.statusCode, 503);
            assert.deepEqual(res.json(), { status: "not_ready", checks: { database: "unavailable" } });
        } finally {
            await broken.close();
            await unreachable.end();
        }
    });
});

describe("conversations", () => {
    let app: TestApp;
    before(() => (app = testApp({ chatAuthSecret: CHAT_SECRET })));
    beforeEach(resetDatabase);
    after(async () => {
        await app.close();
        await pool.end();
    });

    it("creates a conversation (no body) and persists it", async () => {
        const res = await app.inject({ method: "POST", url: "/api/v1/conversations" });
        assert.equal(res.statusCode, 201);
        const conversation = ConversationSchema.parse(res.json().data);
        assert.equal(conversation.messageCount, 0);
        assert.equal(conversation.lastMessageAt, null);
        assert.equal(conversation.title, null);
        const { rowCount } = await pool.query("SELECT 1 FROM conversations WHERE id = $1", [conversation.id]);
        assert.equal(rowCount, 1);
    });

    it("keeps a signed-in user's conversation private from every other visitor", async () => {
        const created = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: auth("user-a") });
        assert.equal(created.statusCode, 201);
        const id = created.json().data.id as string;
        const owner = await pool.query<{ owner_subject: string | null }>("SELECT owner_subject FROM conversations WHERE id = $1", [id]);
        assert.equal(owner.rows[0]?.owner_subject, "user-a");

        assert.equal((await app.inject({ method: "GET", url: `/api/v1/conversations/${id}`, headers: auth("user-a") })).statusCode, 200);
        assert.equal((await app.inject({ method: "GET", url: `/api/v1/conversations/${id}`, headers: auth("user-b") })).statusCode, 404);
        assert.equal((await app.inject({ method: "GET", url: `/api/v1/conversations/${id}` })).statusCode, 404);
    });

    it("lists only the signed-in user's conversations, newest first", async () => {
        const first = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: auth("user-a") });
        const other = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: auth("user-b") });
        const second = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: auth("user-a") });
        assert.equal(other.statusCode, 201);

        const listed = await app.inject({ method: "GET", url: "/api/v1/conversations", headers: auth("user-a") });
        assert.equal(listed.statusCode, 200);
        assert.deepEqual(listed.json().data.map((conversation: { id: string }) => conversation.id), [second.json().data.id, first.json().data.id]);
        assert.deepEqual((await app.inject("/api/v1/conversations")).json(), { data: [] });
    });

    it("rejects a malformed or tampered chat ticket instead of treating it as anonymous", async () => {
        const malformed = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: { authorization: "Bearer not-a-ticket" } });
        assert.equal(malformed.statusCode, 401);
        assert.equal(malformed.json().error.code, "UNAUTHORIZED");

        const tampered = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: { authorization: `Bearer ${chatTicket("user-a", "wrong-secret")}` } });
        assert.equal(tampered.statusCode, 401);
    });

    it("accepts an empty JSON object and rejects unknown fields", async () => {
        const ok = await app.inject({ method: "POST", url: "/api/v1/conversations", payload: {} });
        assert.equal(ok.statusCode, 201);
        const bad = await app.inject({ method: "POST", url: "/api/v1/conversations", payload: { userId: "x" } });
        assert.equal(bad.statusCode, 400);
        assert.equal(bad.json().error.code, "VALIDATION_ERROR");
    });

    it("retrieves metadata including message counts", async () => {
        const id = await createConversation(app);
        await sendMessage(app, id, { clientMessageId: "m1", message: "hello\n  there" });
        const res = await app.inject(`/api/v1/conversations/${id}`);
        assert.equal(res.statusCode, 200);
        const conversation = ConversationSchema.parse(res.json().data);
        assert.equal(conversation.id, id);
        assert.equal(conversation.messageCount, 2);
        assert.ok(conversation.lastMessageAt);
        assert.equal(conversation.title, "hello there");
        assert.ok(conversation.updatedAt >= conversation.createdAt);
    });

    it("deletes a conversation with all its messages", async () => {
        const id = await createConversation(app);
        await sendMessage(app, id, { clientMessageId: "m1", message: "3 BHK on Sohna Road" });
        const before = await pool.query("SELECT 1 FROM messages WHERE conversation_id = $1", [id]);
        assert.ok(before.rowCount! > 0);

        const res = await app.inject({ method: "DELETE", url: `/api/v1/conversations/${id}` });
        assert.equal(res.statusCode, 204);
        assert.equal((await pool.query("SELECT 1 FROM conversations WHERE id = $1", [id])).rowCount, 0);
        assert.equal((await pool.query("SELECT 1 FROM messages WHERE conversation_id = $1", [id])).rowCount, 0);
        assert.equal((await app.inject(`/api/v1/conversations/${id}`)).statusCode, 404);
        assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/conversations/${id}` })).statusCode, 404);
    });

    it("lets only the owner delete a signed-in user's conversation", async () => {
        const created = await app.inject({ method: "POST", url: "/api/v1/conversations", headers: auth("user-a") });
        const id = created.json().data.id as string;
        assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/conversations/${id}`, headers: auth("user-b") })).statusCode, 404);
        assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/conversations/${id}` })).statusCode, 404);
        assert.equal((await pool.query("SELECT 1 FROM conversations WHERE id = $1", [id])).rowCount, 1);
        assert.equal((await app.inject({ method: "DELETE", url: `/api/v1/conversations/${id}`, headers: auth("user-a") })).statusCode, 204);
    });

    it("returns 404 for an unknown conversation and 400 for a malformed id", async () => {
        const missing = await app.inject(`/api/v1/conversations/${randomUUID()}`);
        assert.equal(missing.statusCode, 404);
        assert.equal(missing.json().error.code, "CONVERSATION_NOT_FOUND");
        assert.equal(missing.json().error.retryable, false);
        assert.ok(missing.json().error.requestId);

        const malformed = await app.inject("/api/v1/conversations/not-a-uuid");
        assert.equal(malformed.statusCode, 400);
        assert.equal(malformed.json().error.code, "VALIDATION_ERROR");
    });

    it("uses the error envelope for unknown routes", async () => {
        const res = await app.inject("/api/v1/nope");
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error.code, "NOT_FOUND");
    });
});
