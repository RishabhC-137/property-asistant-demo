import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage, MessagePage, SseEvent } from "@property-assistant/contracts";
import { chatReducer, initialChatState, isBusy, type ChatAction, type ChatState } from "./chatReducer.js";

const CONV = "8afb3bef-7971-4649-a244-881e535c4bda";
const USER_ID = "950d63a7-2424-4b9d-a6d1-b1b58e2da6a1";
const BOT_ID = "d2d68e1a-8f1f-4c26-9fb6-a482f6e24568";
const AT = "2026-10-19T10:00:00.000Z";

const run = (actions: ChatAction[], state: ChatState = initialChatState) => actions.reduce(chatReducer, state);
const ready = (page: MessagePage | null = null) => run([{ type: "conversation/ready", conversationId: CONV, page }]);
const ev = (event: SseEvent): ChatAction => ({ type: "stream/event", clientMessageId: "m1", event });

const started = ev({
    event: "message.started",
    data: { conversationId: CONV, clientMessageId: "m1", userMessageId: USER_ID, assistantMessageId: BOT_ID, replay: false },
});

const completedMessage: ChatMessage = {
    id: BOT_ID,
    conversationId: CONV,
    role: "assistant",
    clientMessageId: "m1",
    status: "completed",
    content: "Hello there",
    blocks: [
        { type: "text", data: { text: "Hello there" } },
        { type: "quick_replies", data: { prompt: null, options: [{ id: "a", label: "A", value: "a" }] } },
    ],
    replyToMessageId: USER_ID,
    createdAt: AT,
    completedAt: AT,
    error: null,
};

describe("chatReducer", () => {
    it("adds an optimistic user message and tracks the request in flight", () => {
        const state = run([{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }], ready());
        assert.equal(state.messages.length, 1);
        assert.deepEqual([state.messages[0]?.role, state.messages[0]?.status, state.messages[0]?.content], ["user", "sending", "hi"]);
        assert.equal(isBusy(state), true);
    });

    it("builds the reply from deltas and blocks, then replaces it with the final message", () => {
        let state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "hi", at: AT },
                started,
                ev({ event: "text.delta", data: { messageId: BOT_ID, index: 0, delta: "Hello " } }),
                ev({ event: "text.delta", data: { messageId: BOT_ID, index: 0, delta: "there" } }),
                ev({ event: "block", data: { messageId: BOT_ID, index: 1, block: completedMessage.blocks[1]! } }),
            ],
            ready(),
        );
        const [user, bot] = state.messages;
        assert.deepEqual([user?.id, user?.status], [USER_ID, "completed"]);
        assert.deepEqual([bot?.status, bot?.content, bot?.blocks.length], ["streaming", "Hello there", 2]);
        assert.equal(isBusy(state), true);

        state = chatReducer(state, ev({ event: "message.completed", data: { message: completedMessage } }));
        assert.equal(state.messages[1]?.status, "completed");
        assert.deepEqual(state.messages[1]?.blocks, completedMessage.blocks);
        assert.equal(isBusy(state), false);
    });

    it("shows what the assistant is doing until text or a block arrives", () => {
        let state = run([{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }, started], ready());
        state = chatReducer(state, ev({ event: "status", data: { messageId: BOT_ID, label: "Searching projects…" } }));
        assert.equal(state.messages[1]?.activity, "Searching projects…");
        state = chatReducer(state, ev({ event: "text.delta", data: { messageId: BOT_ID, index: 0, delta: "Found" } }));
        assert.equal(state.messages[1]?.activity, null);
        state = chatReducer(state, ev({ event: "message.completed", data: { message: completedMessage } }));
        state = chatReducer(state, ev({ event: "status", data: { messageId: BOT_ID, label: "Late" } }));
        assert.equal(state.messages[1]?.activity, null, "ignored once the reply is complete");
    });

    it("stops typing and the working dots as soon as stop is pressed, before the server ends the reply", () => {
        let state = run([{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }, started], ready());
        state = chatReducer(state, ev({ event: "status", data: { messageId: BOT_ID, label: "Searching projects…" } }));
        state = chatReducer(state, { type: "stop/requested", clientMessageId: "m1" });
        assert.deepEqual(
            [state.messages[1]?.stopped, state.messages[1]?.live, state.messages[1]?.activity, state.messages[1]?.status],
            [true, false, null, "streaming"],
        );
        assert.equal(isBusy(state), true, "busy until the server confirms");
        state = chatReducer(state, ev({ event: "status", data: { messageId: BOT_ID, label: "Writing a reply…" } }));
        assert.equal(state.messages[1]?.activity, null, "no more activity once stopped");
        state = chatReducer(state, ev({ event: "message.completed", data: { message: completedMessage } }));
        assert.deepEqual([state.messages[1]?.status, state.messages[1]?.live, isBusy(state)], ["completed", false, false]);
    });

    it("keeps suggested questions that arrive after the reply, in memory only", () => {
        let state = run([{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }, started], ready());
        state = chatReducer(state, ev({ event: "message.completed", data: { message: completedMessage } }));
        state = chatReducer(state, ev({ event: "suggestions", data: { messageId: BOT_ID, questions: ["Payment plan?"] } }));
        assert.deepEqual(state.messages[1]?.suggestions, ["Payment plan?"]);
        assert.equal(isBusy(state), false, "the next message can be sent while they arrive");
    });

    it("discards partial output on message.error and allows a retry that replaces the reply", () => {
        let state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "hi", at: AT },
                started,
                ev({ event: "text.delta", data: { messageId: BOT_ID, index: 0, delta: "Partial" } }),
                ev({ event: "message.error", data: { messageId: BOT_ID, error: { code: "PROVIDER_ERROR", message: "x", retryable: true } } }),
            ],
            ready(),
        );
        assert.deepEqual([state.messages[1]?.status, state.messages[1]?.blocks, state.messages[1]?.error?.code], ["failed", [], "PROVIDER_ERROR"]);
        assert.equal(isBusy(state), false);

        state = run([{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }, started], state);
        assert.equal(state.messages.length, 2, "same two rows, no duplicates");
        assert.equal(state.messages[1]?.status, "streaming");
    });

    it("never discards a completed reply when the same id is sent again", () => {
        let state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "hi", at: AT },
                started,
                ev({ event: "message.completed", data: { message: completedMessage } }),
            ],
            ready(),
        );
        state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "something else", at: AT },
                { type: "send/failed", clientMessageId: "m1", error: { code: "IDEMPOTENCY_KEY_REUSED", message: "x", retryable: false } },
            ],
            state,
        );
        assert.deepEqual(state.messages.map((m) => [m.role, m.status]), [["user", "completed"], ["assistant", "completed"]]);
        assert.equal(state.messages[0]?.content, "hi", "original text kept");
        assert.equal(isBusy(state), false);
    });

    it("puts a pre-stream HTTP failure on the user message", () => {
        const state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "hi", at: AT },
                { type: "send/failed", clientMessageId: "m1", error: { code: "MESSAGE_IN_PROGRESS", message: "busy", retryable: true } },
            ],
            ready(),
        );
        assert.deepEqual([state.messages[0]?.status, state.messages[0]?.error?.code], ["failed", "MESSAGE_IN_PROGRESS"]);
        assert.equal(isBusy(state), false);
    });

    it("marks replayed replies", () => {
        const state = run(
            [
                { type: "send/start", clientMessageId: "m1", text: "hi", at: AT },
                ev({ event: "message.started", data: { conversationId: CONV, clientMessageId: "m1", userMessageId: USER_ID, assistantMessageId: BOT_ID, replay: true } }),
                ev({ event: "message.completed", data: { message: completedMessage } }),
            ],
            ready(),
        );
        assert.equal(state.messages[1]?.replayed, true);
        assert.equal(state.messages[1]?.live, false, "replays are not typed out");
    });

    it("marks replies streamed in this tab as live, and keeps the flag once completed", () => {
        const started = (replay: boolean) =>
            ev({ event: "message.started", data: { conversationId: CONV, clientMessageId: "m1", userMessageId: USER_ID, assistantMessageId: BOT_ID, replay } });
        const state = run(
            [{ type: "send/start", clientMessageId: "m1", text: "hi", at: AT }, started(false), ev({ event: "message.completed", data: { message: completedMessage } })],
            ready(),
        );
        assert.equal(state.messages[1]?.live, true);
        assert.equal(ready({ data: [completedMessage], pagination: { limit: 1, hasMore: false, nextCursor: null } }).messages[0]?.live, false, "history is not live");
    });

    it("loads history and prepends older pages without duplicates", () => {
        const user: ChatMessage = { ...completedMessage, id: USER_ID, role: "user", content: "hi", blocks: [], replyToMessageId: null };
        const older: ChatMessage = { ...user, id: "11111111-1111-4111-8111-111111111111", clientMessageId: "m0" };
        let state = ready({ data: [user, completedMessage], pagination: { limit: 2, hasMore: true, nextCursor: "c1" } });
        assert.deepEqual(state.history, { hasMore: true, nextCursor: "c1", loadingOlder: false });

        state = run(
            [
                { type: "history/loadingOlder" },
                { type: "history/olderLoaded", page: { data: [older, user], pagination: { limit: 2, hasMore: false, nextCursor: null } } },
            ],
            state,
        );
        assert.deepEqual(state.messages.map((m) => m.clientMessageId), ["m0", "m1", "m1"]);
        assert.equal(state.history.hasMore, false);
    });

    it("shows a reply still generating elsewhere without blocking this tab", () => {
        const pending: ChatMessage = { ...completedMessage, status: "pending", blocks: [], content: "", completedAt: null };
        const state = ready({ data: [pending], pagination: { limit: 30, hasMore: false, nextCursor: null } });
        assert.equal(state.messages[0]?.status, "streaming");
        assert.equal(isBusy(state), false);
    });
});
