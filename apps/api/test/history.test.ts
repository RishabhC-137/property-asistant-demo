import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { MessagePageSchema } from "@property-assistant/contracts";
import { ScriptedProvider, createConversation, pool, resetDatabase, sendMessage, testApp, type TestApp } from "./helpers.js";

describe("GET /conversations/:id/messages", () => {
    let app: TestApp;
    before(() => (app = testApp()));
    beforeEach(resetDatabase);
    after(async () => {
        await app.close();
        await pool.end();
    });

    const list = async (conversationId: string, query = "") => {
        const res = await app.inject(`/api/v1/conversations/${conversationId}/messages${query}`);
        return res;
    };

    it("returns an empty page for a new conversation", async () => {
        const id = await createConversation(app);
        const res = await list(id);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { data: [], pagination: { limit: 50, hasMore: false, nextCursor: null } });
    });

    it("paginates newest-first pages, each in chronological order", async () => {
        const id = await createConversation(app);
        for (const [n, message] of ["hello", "compare", "call me"].entries()) {
            await sendMessage(app, id, { clientMessageId: `m-${n}`, message });
        }

        const first = MessagePageSchema.parse((await list(id, "?limit=4")).json());
        assert.deepEqual(
            first.data.map((m) => [m.clientMessageId, m.role]),
            [
                ["m-1", "user"],
                ["m-1", "assistant"],
                ["m-2", "user"],
                ["m-2", "assistant"],
            ],
        );
        assert.equal(first.pagination.hasMore, true);
        assert.ok(first.pagination.nextCursor);

        const second = MessagePageSchema.parse(
            (await list(id, `?limit=4&before=${encodeURIComponent(first.pagination.nextCursor!)}`)).json(),
        );
        assert.deepEqual(
            second.data.map((m) => [m.clientMessageId, m.role]),
            [
                ["m-0", "user"],
                ["m-0", "assistant"],
            ],
        );
        assert.deepEqual(second.pagination, { limit: 4, hasMore: false, nextCursor: null });

        const all = MessagePageSchema.parse((await list(id)).json());
        assert.equal(all.data.length, 6);
        assert.deepEqual([...second.data, ...first.data], all.data, "pages tile the full history");
    });

    it("includes ordered blocks for assistant messages only", async () => {
        const id = await createConversation(app);
        await sendMessage(app, id, { clientMessageId: "m", message: "compare" });
        const [user, assistant] = MessagePageSchema.parse((await list(id)).json()).data;
        assert.deepEqual(user!.blocks, []);
        assert.equal(user!.content, "compare");
        assert.deepEqual(assistant!.blocks.map((b) => b.type), ["text", "property_comparison"]);
        assert.equal(assistant!.replyToMessageId, user!.id);
    });

    it("shows failed replies with their status and error", async () => {
        const failing = testApp({ provider: new ScriptedProvider([], new Error("x")) });
        try {
            const id = await createConversation(failing);
            await sendMessage(failing, id, { clientMessageId: "m", message: "hi" });
            const [, assistant] = MessagePageSchema.parse((await list(id)).json()).data;
            assert.equal(assistant!.status, "failed");
            assert.equal(assistant!.error?.code, "PROVIDER_ERROR");
            assert.equal(assistant!.completedAt, null);
        } finally {
            await failing.close();
        }
    });

    it("validates limit, cursor and conversation", async () => {
        const id = await createConversation(app);
        for (const q of ["?limit=0", "?limit=101", "?limit=abc", "?other=1"]) {
            const res = await list(id, q);
            assert.equal(res.statusCode, 400, q);
            assert.equal(res.json().error.code, "VALIDATION_ERROR");
        }
        for (const cursor of ["garbage", Buffer.from('{"v":1,"seq":"-1"}').toString("base64url")]) {
            const res = await list(id, `?before=${cursor}`);
            assert.equal(res.statusCode, 400);
            assert.equal(res.json().error.code, "INVALID_CURSOR");
        }
        const missing = await list(randomUUID());
        assert.equal(missing.statusCode, 404);
        assert.equal(missing.json().error.code, "CONVERSATION_NOT_FOUND");
    });
});
