import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import {
    ChatBlockSchema,
    ChatMessageSchema,
    MessageStartedEventSchema,
    type ChatBlock,
    type SseEvent,
} from "@property-assistant/contracts";
import { MessageRepository } from "../src/modules/chat/message.repository.js";
import { MockChatProvider, ProviderError, type ChatProvider, type ProviderEvent, type ProviderInput } from "@property-assistant/llm";
import type { Queryable } from "../src/db/pool.js";
import {
    CountingProvider,
    GatedProvider,
    ScriptedProvider,
    createConversation,
    parseSse,
    pool,
    resetDatabase,
    sendMessage,
    testApp,
    type TestApp,
} from "./helpers.js";

type EventOf<E extends SseEvent["event"]> = Extract<SseEvent, { event: E }>;
const only = <E extends SseEvent["event"]>(events: SseEvent[], name: E) =>
    events.filter((e): e is EventOf<E> => e.event === name);
const single = <E extends SseEvent["event"]>(events: SseEvent[], name: E) => {
    const found = only(events, name);
    assert.equal(found.length, 1, `expected exactly one ${name}`);
    return found[0]!;
};

async function dbMessages(conversationId: string) {
    const { rows } = await pool.query(
        `SELECT id, role, client_message_id, content, status, attempt, error, reply_to_message_id
         FROM messages WHERE conversation_id = $1 ORDER BY seq`,
        [conversationId],
    );
    return rows;
}

async function dbBlocks(messageId: string) {
    const { rows } = await pool.query(
        "SELECT position, type, data FROM message_blocks WHERE message_id = $1 ORDER BY position",
        [messageId],
    );
    return rows;
}

const apps: TestApp[] = [];
function app(options: Parameters<typeof testApp>[0] = {}) {
    const instance = testApp(options);
    apps.push(instance);
    return instance;
}

describe("POST /conversations/:id/messages", () => {
    beforeEach(resetDatabase);
    after(async () => {
        await Promise.all(apps.map((a) => a.close()));
        await pool.end();
    });

    it("streams the assistant reply as SSE in protocol order", async () => {
        const server = app();
        const conversationId = await createConversation(server);
        const res = await sendMessage(server, conversationId, {
            clientMessageId: "m-1",
            message: "Show me 3 BHK flats in Metro",
        });

        assert.equal(res.statusCode, 200);
        assert.match(String(res.headers["content-type"]), /^text\/event-stream/);
        assert.equal(res.headers["cache-control"], "no-cache, no-transform");

        const events = parseSse(res.payload);
        assert.equal(events[0]?.event, "message.started");
        assert.equal(events.at(-1)?.event, "message.completed");
        assert.deepEqual(
            [...new Set(events.map((e) => e.event))],
            ["message.started", "text.delta", "block", "message.completed"],
        );

        const started = MessageStartedEventSchema.parse(single(events, "message.started").data);
        assert.equal(started.replay, false);
        assert.equal(started.conversationId, conversationId);
        assert.equal(started.clientMessageId, "m-1");

        const deltas = only(events, "text.delta");
        assert.ok(deltas.length > 1, "text is streamed incrementally");
        assert.ok(deltas.every((d) => d.data.index === 0 && d.data.messageId === started.assistantMessageId));

        const blocks = only(events, "block");
        assert.deepEqual(
            blocks.map((b) => [b.data.index, b.data.block.type]),
            [[1, "clarification"]],
        );

        const completed = ChatMessageSchema.parse(single(events, "message.completed").data.message);
        assert.equal(completed.id, started.assistantMessageId);
        assert.equal(completed.status, "completed");
        assert.equal(completed.replyToMessageId, started.userMessageId);
        assert.equal(completed.blocks[0]?.type, "text");
        assert.equal(completed.content, deltas.map((d) => d.data.delta).join(""));
        assert.deepEqual(completed.blocks.slice(1), blocks.map((b) => b.data.block));
    });

    it("persists the user message, assistant message and ordered blocks", async () => {
        const server = app();
        const conversationId = await createConversation(server);
        const res = await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "  compare  " });
        const completed = single(parseSse(res.payload), "message.completed").data.message;

        const rows = await dbMessages(conversationId);
        assert.equal(rows.length, 2);
        const [user, assistant] = rows;
        assert.deepEqual([user.role, user.content, user.status], ["user", "compare", "completed"]);
        assert.deepEqual([assistant.role, assistant.status, assistant.attempt], ["assistant", "completed", 1]);
        assert.equal(assistant.reply_to_message_id, user.id);
        assert.equal(assistant.content, completed.content);

        const stored = await dbBlocks(assistant.id);
        assert.deepEqual(
            stored.map((b) => [b.position, b.type]),
            [
                [0, "text"],
                [1, "property_comparison"],
            ],
        );
        for (const [i, row] of stored.entries()) {
            const block = ChatBlockSchema.parse({ type: row.type, data: row.data });
            assert.deepEqual(block, completed.blocks[i]);
        }
    });

    it("stores normalized text and treats spacing-only differences as the same message", async () => {
        const provider = new CountingProvider(new MockChatProvider());
        const server = app({ provider });
        const conversationId = await createConversation(server);

        await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "  3   BHK \n\n\n\n flats  " });
        const [user] = await dbMessages(conversationId);
        assert.equal(user.content, "3 BHK\n\nflats");

        const retry = await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "3 BHK\n\n   flats" });
        assert.equal(retry.headers["idempotent-replayed"], "true");
        assert.equal(provider.calls, 1);
    });

    it("accepts exactly 4000 characters and rejects 4001", async () => {
        const server = app();
        const conversationId = await createConversation(server);
        const ok = await sendMessage(server, conversationId, { clientMessageId: "max", message: "x".repeat(4000) });
        assert.equal(ok.statusCode, 200);
        const tooLong = await sendMessage(server, conversationId, { clientMessageId: "over", message: "x".repeat(4001) });
        assert.equal(tooLong.statusCode, 400);
        assert.equal(tooLong.json().error.code, "VALIDATION_ERROR");
        assert.equal(tooLong.json().error.details[0].path, "message");
    });

    it("replays the original response for a retry with the same id and payload", async () => {
        const provider = new CountingProvider(new MockChatProvider());
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "m-1", message: "3 BHK under 4 crore" };

        const first = parseSse((await sendMessage(server, conversationId, body)).payload);
        const retryRes = await sendMessage(server, conversationId, { ...body, message: ` ${body.message} ` });
        assert.equal(retryRes.statusCode, 200);
        assert.equal(retryRes.headers["idempotent-replayed"], "true");
        const retry = parseSse(retryRes.payload);

        assert.equal(provider.calls, 1, "no second generation");
        assert.equal(single(retry, "message.started").data.replay, true);
        const original = single(first, "message.completed").data.message;
        const replayed = single(retry, "message.completed").data.message;
        assert.deepEqual(replayed, original);
        assert.deepEqual(
            only(retry, "block").map((b) => b.data),
            only(first, "block").map((b) => b.data),
        );
        assert.equal(only(retry, "text.delta").map((d) => d.data.delta).join(""), original.content);
        assert.equal((await dbMessages(conversationId)).length, 2);
    });

    it("rejects reuse of a clientMessageId with a different payload (409)", async () => {
        const server = app();
        const conversationId = await createConversation(server);
        await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "hello" });
        const res = await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "goodbye" });

        assert.equal(res.statusCode, 409);
        assert.match(String(res.headers["content-type"]), /application\/json/);
        assert.equal(res.json().error.code, "IDEMPOTENCY_KEY_REUSED");
        assert.equal(res.json().error.retryable, false);
        const rows = await dbMessages(conversationId);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].content, "hello");
    });

    it("scopes clientMessageId to the conversation", async () => {
        const provider = new CountingProvider(new MockChatProvider());
        const server = app({ provider });
        const a = await createConversation(server);
        const b = await createConversation(server);
        await sendMessage(server, a, { clientMessageId: "same", message: "hello" });
        const res = await sendMessage(server, b, { clientMessageId: "same", message: "hello" });
        assert.equal(single(parseSse(res.payload), "message.started").data.replay, false);
        assert.equal(provider.calls, 2);
    });

    it("concurrent duplicate submissions produce exactly one reply", async () => {
        const provider = new CountingProvider(new MockChatProvider());
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "dup", message: "compare" };

        const responses = await Promise.all(Array.from({ length: 8 }, () => sendMessage(server, conversationId, body)));

        assert.equal(provider.calls, 1, "provider invoked once");
        const rows = await dbMessages(conversationId);
        assert.deepEqual(rows.map((r) => r.role), ["user", "assistant"]);

        const assistantIds = new Set<string>();
        let generated = 0;
        for (const res of responses) {
            if (res.statusCode === 409) {
                assert.equal(res.json().error.code, "MESSAGE_IN_PROGRESS");
                assert.equal(res.json().error.retryable, true);
                assert.equal(res.headers["retry-after"], "1");
                continue;
            }
            assert.equal(res.statusCode, 200);
            const events = parseSse(res.payload);
            const started = single(events, "message.started").data;
            if (!started.replay) generated += 1;
            assistantIds.add(started.assistantMessageId);
            assert.equal(single(events, "message.completed").data.message.status, "completed");
        }
        assert.equal(generated, 1);
        assert.deepEqual([...assistantIds], [rows[1].id]);
        assert.equal((await dbBlocks(rows[1].id)).length, 2);
    });

    it("returns 409 MESSAGE_IN_PROGRESS for a duplicate while the reply is streaming", async () => {
        const provider = new GatedProvider();
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "slow", message: "hi" };

        const inFlight = sendMessage(server, conversationId, body);
        await provider.started;
        const duplicate = await sendMessage(server, conversationId, body);
        assert.equal(duplicate.statusCode, 409);
        assert.equal(duplicate.json().error.code, "MESSAGE_IN_PROGRESS");

        provider.release();
        const first = parseSse((await inFlight).payload);
        assert.equal(single(first, "message.completed").data.message.content, "Working done.");

        const retry = parseSse((await sendMessage(server, conversationId, body)).payload);
        assert.equal(single(retry, "message.started").data.replay, true);
        assert.equal(provider.calls, 1);
    });

    it("a superseded attempt cannot overwrite the reply that replaced it", async () => {
        // Lease 0: any pending reply counts as abandoned, so the duplicate takes over.
        const provider = new GatedProvider();
        const server = app({ provider, generationLeaseMs: 0 });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "lease", message: "hi" };

        const firstRequest = sendMessage(server, conversationId, body);
        await provider.started;
        const secondRequest = sendMessage(server, conversationId, body);
        while (provider.calls < 2) await new Promise((r) => setTimeout(r, 5));
        provider.release();
        const [first, second] = (await Promise.all([firstRequest, secondRequest])).map((r) => parseSse(r.payload));

        assert.equal(single(first, "message.error").data.error.code, "MESSAGE_IN_PROGRESS");
        assert.equal(single(second, "message.completed").data.message.status, "completed");
        const [, assistant] = await dbMessages(conversationId);
        assert.deepEqual([assistant.status, assistant.attempt], ["completed", 2]);
        assert.equal((await dbBlocks(assistant.id)).length, 1, "only one set of blocks");
    });

    it("emits message.error and marks the reply failed when the provider throws", async () => {
        const provider = new ScriptedProvider([{ kind: "text", delta: "Partial " }], new Error("upstream down"));
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const res = await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "hi" });

        assert.equal(res.statusCode, 200);
        const events = parseSse(res.payload);
        assert.deepEqual(
            events.map((e) => e.event),
            ["message.started", "text.delta", "message.error"],
        );
        const error = single(events, "message.error").data;
        assert.equal(error.messageId, single(events, "message.started").data.assistantMessageId);
        assert.deepEqual(error.error, {
            code: "PROVIDER_ERROR",
            message: "The assistant could not respond. Please retry.",
            retryable: true,
        });
        assert.doesNotMatch(res.payload, /upstream down/, "internal error text is not leaked");

        const [, assistant] = await dbMessages(conversationId);
        assert.equal(assistant.status, "failed");
        assert.equal(assistant.error.code, "PROVIDER_ERROR");
        assert.equal((await dbBlocks(assistant.id)).length, 0);
    });

    it("shows a provider's user-facing message, such as for a rate limit", async () => {
        const failure = new ProviderError("Gemini rate limit reached", "Too many requests. Please try again in a minute.");
        const server = app({ provider: new ScriptedProvider([], failure) });
        const conversationId = await createConversation(server);
        const events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "m-1", message: "hi" })).payload);
        assert.deepEqual(single(events, "message.error").data.error, {
            code: "PROVIDER_ERROR",
            message: "Too many requests. Please try again in a minute.",
            retryable: true,
        });
    });

    it("regenerates a failed reply when retried with the same id", async () => {
        let fail = true;
        const flaky: ChatProvider = {
            name: "flaky",
            async *generate(): AsyncIterable<ProviderEvent> {
                yield { kind: "text", delta: "Answer." };
                if (fail) throw new Error("transient");
            },
        };
        const server = app({ provider: flaky });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "m-1", message: "hi" };

        single(parseSse((await sendMessage(server, conversationId, body)).payload), "message.error");
        fail = false;
        const retry = parseSse((await sendMessage(server, conversationId, body)).payload);
        assert.equal(single(retry, "message.started").data.replay, false);
        const message = single(retry, "message.completed").data.message;
        assert.equal(message.content, "Answer.");
        assert.equal(message.error, null);

        const rows = await dbMessages(conversationId);
        assert.equal(rows.length, 2, "same rows reused");
        assert.deepEqual([rows[1].status, rows[1].attempt], ["completed", 2]);

        const again = parseSse((await sendMessage(server, conversationId, body)).payload);
        assert.equal(single(again, "message.started").data.replay, true);
    });

    it("rolls back the whole reply when persisting a block fails", async () => {
        class FailingBlocks extends MessageRepository {
            failNext = true;
            override async insertBlock(db: Queryable, messageId: string, position: number, block: ChatBlock) {
                if (position === 1 && this.failNext) {
                    this.failNext = false;
                    throw new Error("disk full");
                }
                return super.insertBlock(db, messageId, position, block);
            }
        }
        const messages = new FailingBlocks();
        const server = app({ messages });
        const conversationId = await createConversation(server);
        const body = { clientMessageId: "m-1", message: "compare" };

        const events = parseSse((await sendMessage(server, conversationId, body)).payload);
        assert.equal(single(events, "message.error").data.error.code, "PERSISTENCE_ERROR");
        assert.equal(only(events, "message.completed").length, 0);

        const [, assistant] = await dbMessages(conversationId);
        assert.equal(assistant.status, "failed", "completion update rolled back");
        assert.equal(assistant.content, "");
        assert.equal((await dbBlocks(assistant.id)).length, 0, "block 0 rolled back");
        assert.equal(pool.totalCount - pool.idleCount, 0, "no leaked clients");

        const retry = parseSse((await sendMessage(server, conversationId, body)).payload);
        assert.equal(single(retry, "message.completed").data.message.blocks.length, 2);
        assert.equal((await dbBlocks(assistant.id)).length, 2);
    });

    it("rejects invalid or empty provider output", async () => {
        const invalid = new ScriptedProvider([
            { kind: "text", delta: "Here:" },
            { kind: "block", block: { type: "quick_replies", data: { prompt: null, options: [] } } },
        ]);
        let server = app({ provider: invalid });
        let conversationId = await createConversation(server);
        let events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "a", message: "hi" })).payload);
        const error = single(events, "message.error").data.error;
        assert.equal(error.code, "INVALID_PROVIDER_OUTPUT");
        assert.ok(Array.isArray(error.details));
        assert.equal(only(events, "block").length, 0, "invalid block never streamed");

        server = app({ provider: new ScriptedProvider([]) });
        conversationId = await createConversation(server);
        events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "b", message: "hi" })).payload);
        assert.equal(single(events, "message.error").data.error.code, "INVALID_PROVIDER_OUTPUT");
    });

    it("stops a reply on request, keeping what was already streamed", async () => {
        const provider = new GatedProvider();
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const pending = sendMessage(server, conversationId, { clientMessageId: "stop-1", message: "hi" });
        await provider.started;

        const assistant = (await dbMessages(conversationId)).find((m) => m.role === "assistant")!;
        const stop = await server.inject({ method: "POST", url: `/api/v1/conversations/${conversationId}/messages/${assistant.id}/stop` });
        assert.equal(stop.statusCode, 200);
        assert.deepEqual(stop.json(), { data: { stopped: true } });
        provider.release();

        const events = parseSse((await pending).payload);
        const message = single(events, "message.completed").data.message;
        assert.equal(message.content, "Working ", "the rest of the reply is never generated");
        assert.equal((await dbMessages(conversationId)).find((m) => m.role === "assistant")?.status, "completed");

        const again = await server.inject({ method: "POST", url: `/api/v1/conversations/${conversationId}/messages/${assistant.id}/stop` });
        assert.deepEqual(again.json(), { data: { stopped: false } }, "nothing is generating any more");
    });

    it("ends a stopped reply at once, even while the provider is stuck in a slow step", async () => {
        let started!: () => void;
        const ready = new Promise<void>((resolve) => (started = resolve));
        let finishSlowStep!: () => void;
        const slowStep = new Promise<void>((resolve) => (finishSlowStep = resolve));
        const provider: ChatProvider = {
            name: "slow",
            async *generate() {
                yield { kind: "text", delta: "Looking that up" };
                started();
                // Ignores the stop signal, like a lookup that cannot be cancelled.
                await slowStep;
                yield { kind: "text", delta: " and here it is." };
            },
        };
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const pending = sendMessage(server, conversationId, { clientMessageId: "stop-3", message: "hi" });
        await ready;
        const assistant = (await dbMessages(conversationId)).find((m) => m.role === "assistant")!;
        await server.inject({ method: "POST", url: `/api/v1/conversations/${conversationId}/messages/${assistant.id}/stop` });

        const message = single(parseSse((await pending).payload), "message.completed").data.message;
        assert.equal(message.content, "Looking that up", "ended without waiting for the slow step");
        finishSlowStep();
    });

    it("reports a reply stopped before anything arrived as cancelled, so it can be retried", async () => {
        let started!: () => void;
        const ready = new Promise<void>((resolve) => (started = resolve));
        const provider: ChatProvider = {
            name: "waiting",
            async *generate(input) {
                started();
                await new Promise((resolve) => input.signal?.addEventListener("abort", resolve));
            },
        };
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const pending = sendMessage(server, conversationId, { clientMessageId: "stop-2", message: "hi" });
        await ready;
        const assistant = (await dbMessages(conversationId)).find((m) => m.role === "assistant")!;
        await server.inject({ method: "POST", url: `/api/v1/conversations/${conversationId}/messages/${assistant.id}/stop` });

        const error = single(parseSse((await pending).payload), "message.error").data.error;
        assert.deepEqual([error.code, error.retryable], ["CANCELLED", true]);
        assert.equal((await dbMessages(conversationId)).find((m) => m.role === "assistant")?.status, "failed");

        const wrong = await server.inject({ method: "POST", url: `/api/v1/conversations/${randomUUID()}/messages/${assistant.id}/stop` });
        assert.deepEqual(wrong.json(), { data: { stopped: false } }, "another conversation cannot stop it");
    });

    it("streams status notes while working but never stores them", async () => {
        const provider = new ScriptedProvider([
            { kind: "status", label: "Searching projects…" },
            { kind: "text", delta: "Found some." },
        ]);
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "s", message: "hi" })).payload);

        assert.deepEqual(only(events, "status").map((e) => e.data.label), ["Searching projects…"]);
        const message = single(events, "message.completed").data.message;
        assert.deepEqual(message.blocks, [{ type: "text", data: { text: "Found some." } }]);
        assert.deepEqual((await dbBlocks(message.id)).map((b) => b.type), ["text"]);
    });

    it("sends suggested next questions after the reply completes, without storing them", async () => {
        const provider = Object.assign(new ScriptedProvider([{ kind: "text", delta: "Found some." }]), {
            followUps: async ({ message }: { message: string }) => [`More like ${message}?`, "Payment plan?"],
        });
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "f", message: "3 BHK" })).payload);

        assert.deepEqual(events.map((e) => e.event).slice(-2), ["message.completed", "suggestions"], "after the reply is complete");
        const message = single(events, "message.completed").data.message;
        assert.deepEqual(single(events, "suggestions").data, { messageId: message.id, questions: ["More like 3 BHK?", "Payment plan?"] });
        assert.deepEqual((await dbBlocks(message.id)).map((b) => b.type), ["text"], "never stored");

        const failing = Object.assign(new ScriptedProvider([{ kind: "text", delta: "Hi." }]), {
            followUps: async () => {
                throw new Error("boom");
            },
        });
        const quiet = app({ provider: failing });
        const other = await createConversation(quiet);
        const quietEvents = parseSse((await sendMessage(quiet, other, { clientMessageId: "g", message: "hi" })).payload);
        assert.equal(only(quietEvents, "suggestions").length, 0);
        assert.equal(quietEvents.at(-1)?.event, "message.completed", "a failure costs only the pills");
    });

    it("keeps interleaved text and blocks in order", async () => {
        const provider = new ScriptedProvider([
            { kind: "text", delta: "Before " },
            { kind: "text", delta: "cards." },
            {
                kind: "block",
                block: { type: "quick_replies", data: { prompt: null, options: [{ id: "a", label: "A", value: "a" }] } },
            },
            { kind: "text", delta: "After." },
        ]);
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const events = parseSse((await sendMessage(server, conversationId, { clientMessageId: "m", message: "hi" })).payload);

        assert.deepEqual(
            only(events, "text.delta").map((d) => [d.data.index, d.data.delta]),
            [
                [0, "Before "],
                [0, "cards."],
                [2, "After."],
            ],
        );
        const message = single(events, "message.completed").data.message;
        assert.deepEqual(message.blocks.map((b) => b.type), ["text", "quick_replies", "text"]);
        assert.equal(message.content, "Before cards.\n\nAfter.");
    });

    it("gives the provider earlier replies' structured blocks as history", async () => {
        const inputs: ProviderInput[] = [];
        const provider: ChatProvider = {
            name: "recording",
            async *generate(input) {
                inputs.push(input);
                yield* new MockChatProvider().generate(input);
            },
        };
        const server = app({ provider });
        const conversationId = await createConversation(server);
        await sendMessage(server, conversationId, { clientMessageId: "1", message: "Please call me back" });
        await sendMessage(server, conversationId, { clientMessageId: "2", message: "hi" });

        const history = inputs[1]?.history ?? [];
        assert.deepEqual(
            history.map((m) => [m.role, m.blocks?.map((b) => b.type)]),
            [
                ["user", []],
                ["assistant", ["lead_capture_form"]],
            ],
        );
        assert.match(history[1]?.content ?? "", /advisor/);
    });

    it("tells the provider which project page the chat is on, for that message only", async () => {
        const inputs: ProviderInput[] = [];
        const provider: ChatProvider = {
            name: "recording",
            async *generate(input) {
                inputs.push(input);
                yield* new MockChatProvider().generate(input);
            },
        };
        const server = app({ provider });
        const conversationId = await createConversation(server);
        await sendMessage(server, conversationId, { clientMessageId: "1", message: "price?", context: { projectId: "adani-the-marq" } });
        await sendMessage(server, conversationId, { clientMessageId: "2", message: "hi" });

        assert.deepEqual(inputs[0]?.page, { projectId: "adani-the-marq" });
        assert.equal(inputs[1]?.page, null);
        assert.equal(inputs[1]?.history[0]?.content, "price?", "the page is not stored with the message");
    });

    it("summarises messages older than the history window as memory", async () => {
        const inputs: ProviderInput[] = [];
        const provider: ChatProvider = {
            name: "recording",
            async *generate(input) {
                inputs.push(input);
                yield* new MockChatProvider().generate(input);
            },
        };
        const server = app({ provider });
        const conversationId = await createConversation(server);
        const messages = ["3 BHK under 3 crore", "Please call me back", ...Array.from({ length: 11 }, (_, i) => `hi ${i}`)];
        for (const [i, message] of messages.entries()) {
            await sendMessage(server, conversationId, { clientMessageId: `m${i}`, message });
        }

        assert.equal(inputs[10]?.memory ?? null, null, "20 earlier messages still fit in the history");
        const last = inputs.at(-1)!;
        assert.equal(last.history.length, 20);
        assert.equal(last.memory?.messageCount, 4);
        assert.deepEqual(last.memory?.userRequests, ["3 BHK under 3 crore", "Please call me back"]);
        assert.deepEqual(last.memory?.forms, ["callback"]);
        assert.ok(last.memory && last.memory.projects.length > 0);
        assert.ok(last.memory.projects.every((p) => p.seen.includes("card") && p.id && p.name));
    });

    describe("request validation", () => {
        it("returns JSON errors before any stream starts and writes nothing", async () => {
            const server = app();
            const conversationId = await createConversation(server);
            const cases: Array<[unknown, number, string]> = [
                [{ clientMessageId: "m", message: "" }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "   " }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "x".repeat(4001) }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "bad id!", message: "hi" }, 400, "VALIDATION_ERROR"],
                [{ message: "hi" }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "hi", role: "assistant" }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "a\u0000b" }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "hi", context: { projectId: "../admin" } }, 400, "VALIDATION_ERROR"],
                [{ clientMessageId: "m", message: "hi", context: { userEmail: "a@b.c" } }, 400, "VALIDATION_ERROR"],
            ];
            for (const [payload, status, code] of cases) {
                const res = await sendMessage(server, conversationId, payload);
                assert.equal(res.statusCode, status, JSON.stringify(payload).slice(0, 60));
                assert.equal(res.json().error.code, code);
            }
            assert.equal((await dbMessages(conversationId)).length, 0);
        });

        it("handles malformed JSON, missing bodies and oversized bodies", async () => {
            const server = app();
            const conversationId = await createConversation(server);
            const url = `/api/v1/conversations/${conversationId}/messages`;

            const malformed = await server.inject({
                method: "POST",
                url,
                headers: { "content-type": "application/json" },
                payload: "{not json",
            });
            assert.equal(malformed.statusCode, 400);
            assert.equal(malformed.json().error.code, "VALIDATION_ERROR");

            const missing = await server.inject({ method: "POST", url });
            assert.equal(missing.statusCode, 400);

            const huge = await server.inject({
                method: "POST",
                url,
                headers: { "content-type": "application/json" },
                payload: JSON.stringify({ clientMessageId: "m", message: "x".repeat(40_000) }),
            });
            assert.equal(huge.statusCode, 413);
            assert.equal(huge.json().error.code, "PAYLOAD_TOO_LARGE");
        });

        it("returns 404 for an unknown conversation and 400 for a malformed id", async () => {
            const server = app();
            const missing = await sendMessage(server, randomUUID(), { clientMessageId: "m", message: "hi" });
            assert.equal(missing.statusCode, 404);
            assert.equal(missing.json().error.code, "CONVERSATION_NOT_FOUND");
            const { rows } = await pool.query("SELECT count(*)::int AS n FROM messages");
            assert.equal(rows[0].n, 0);

            const malformed = await sendMessage(server, "123", { clientMessageId: "m", message: "hi" });
            assert.equal(malformed.statusCode, 400);
        });
    });
});
