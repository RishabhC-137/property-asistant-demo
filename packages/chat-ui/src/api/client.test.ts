import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SseEvent } from "@property-assistant/contracts";
import { ChatApiError, createChatApi } from "./client.js";

const CONV = "8afb3bef-7971-4649-a244-881e535c4bda";
const MSG = "d2d68e1a-8f1f-4c26-9fb6-a482f6e24568";

function sse(...events: Array<[string, unknown]>): string {
    return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}

/** A fetch stub that records calls and streams the given body in small chunks. */
function fakeFetch(status: number, body: string, headers: Record<string, string>) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const impl = (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < body.length; i += 7) controller.enqueue(encoder.encode(body.slice(i, i + 7)));
                controller.close();
            },
        });
        return new Response(stream, { status, headers });
    }) as typeof fetch;
    return { impl, calls };
}

describe("createChatApi", () => {
    it("streams typed events and posts the right request", async () => {
        const body = sse(
            ["message.started", { conversationId: CONV, clientMessageId: "m1", userMessageId: MSG, assistantMessageId: MSG, replay: false }],
            ["text.delta", { messageId: MSG, index: 0, delta: "Hello " }],
            ["unknown.event", { ignored: true }],
            ["text.delta", { messageId: MSG, index: 0, delta: "there" }],
            ["message.completed", { message: { id: MSG } }],
        );
        const { impl, calls } = fakeFetch(200, body, { "content-type": "text/event-stream" });
        const api = createChatApi("/api/v1/", impl);
        const events: SseEvent[] = [];
        await api.sendMessage(CONV, { clientMessageId: "m1", message: "hi" }, { onEvent: (e) => events.push(e) });

        assert.equal(calls[0]?.url, `/api/v1/conversations/${CONV}/messages`);
        assert.equal(calls[0]?.init?.method, "POST");
        assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { clientMessageId: "m1", message: "hi" });
        assert.deepEqual(
            events.map((e) => e.event),
            ["message.started", "text.delta", "text.delta", "message.completed"],
        );
    });

    it("turns JSON error responses into ChatApiError with retry info", async () => {
        const { impl } = fakeFetch(
            409,
            JSON.stringify({ error: { code: "MESSAGE_IN_PROGRESS", message: "busy", retryable: true } }),
            { "content-type": "application/json", "retry-after": "1" },
        );
        const api = createChatApi("/api/v1", impl);
        await assert.rejects(
            api.sendMessage(CONV, { clientMessageId: "m1", message: "hi" }, { onEvent: () => {} }),
            (error: unknown) =>
                error instanceof ChatApiError &&
                error.code === "MESSAGE_IN_PROGRESS" &&
                error.status === 409 &&
                error.retryable &&
                error.retryAfterMs === 1000,
        );
    });

    it("reports a stream that ends without a final event", async () => {
        const { impl } = fakeFetch(200, sse(["text.delta", { messageId: MSG, index: 0, delta: "Hel" }]), {
            "content-type": "text/event-stream",
        });
        const api = createChatApi("/api/v1", impl);
        await assert.rejects(
            api.sendMessage(CONV, { clientMessageId: "m1", message: "hi" }, { onEvent: () => {} }),
            (e: unknown) => e instanceof ChatApiError && e.code === "STREAM_INTERRUPTED",
        );
    });

    it("maps network failures and unwraps data envelopes", async () => {
        const failing = createChatApi("/api/v1", (async () => {
            throw new TypeError("fetch failed");
        }) as typeof fetch);
        await assert.rejects(failing.createConversation(), (e: unknown) => e instanceof ChatApiError && e.code === "NETWORK_ERROR");

        const { impl, calls } = fakeFetch(201, JSON.stringify({ data: { id: CONV } }), { "content-type": "application/json" });
        const conversation = await createChatApi("/api/v1", impl).createConversation();
        assert.equal(conversation.id, CONV);
        assert.equal(calls[0]?.init?.method, "POST");
    });

    it("adds a fresh signed identity ticket without storing it in request bodies", async () => {
        const { impl, calls } = fakeFetch(201, JSON.stringify({ data: { id: CONV } }), { "content-type": "application/json" });
        let reads = 0;
        const api = createChatApi("/api/v1", impl, { getAuthToken: async () => `ticket-${++reads}` });
        await api.createConversation();
        await api.getConversation(CONV);

        assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer ticket-1");
        assert.equal((calls[1]?.init?.headers as Record<string, string>).authorization, "Bearer ticket-2");
        assert.equal(calls[0]?.init?.body, "{}");
    });
});
