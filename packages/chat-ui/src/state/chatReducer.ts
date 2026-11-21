import type { ChatBlock, ChatMessage, MessagePage, SseEvent } from "@property-assistant/contracts";

/**
 * UI-side view of a message. Keys are derived from (role, clientMessageId)
 * so optimistic messages, streamed replies and history rows line up.
 */
export type UiMessageStatus = "sending" | "streaming" | "completed" | "failed";

export interface UiError {
    code: string;
    message: string;
    retryable: boolean;
}

export interface UiMessage {
    key: string;
    id: string | null;
    role: "user" | "assistant";
    clientMessageId: string;
    content: string;
    blocks: ChatBlock[];
    status: UiMessageStatus;
    error: UiError | null;
    createdAt: string;
    /** True when the reply was replayed from storage (idempotent retry). */
    replayed: boolean;
    /** True when this tab watched the reply stream in; only live replies are typed out. */
    live: boolean;
    /** What the assistant is doing while the reply is being prepared (e.g. "Searching projects…"). */
    activity: string | null;
    /** The user pressed stop: show what has arrived as it is, while the server ends the reply. */
    stopped: boolean;
    /** Questions the user might ask next, sent after the reply; kept only in this tab, never stored. */
    suggestions: string[];
}

export interface ChatState {
    phase: "idle" | "loading" | "ready" | "error";
    conversationId: string | null;
    messages: UiMessage[];
    loadError: string | null;
    history: { hasMore: boolean; nextCursor: string | null; loadingOlder: boolean };
    /** clientMessageId of the request this tab is currently sending, if any. */
    inFlight: string | null;
}

export type ChatAction =
    | { type: "conversation/loading" }
    | { type: "conversation/ready"; conversationId: string; page: MessagePage | null }
    | { type: "conversation/failed"; message: string }
    | { type: "history/loadingOlder" }
    | { type: "history/olderLoaded"; page: MessagePage }
    | { type: "history/olderFailed" }
    | { type: "send/start"; clientMessageId: string; text: string; at: string }
    | { type: "send/failed"; clientMessageId: string; error: UiError }
    | { type: "stop/requested"; clientMessageId: string }
    | { type: "stream/event"; clientMessageId: string; event: SseEvent };

export const initialChatState: ChatState = {
    phase: "idle",
    conversationId: null,
    messages: [],
    loadError: null,
    history: { hasMore: false, nextCursor: null, loadingOlder: false },
    inFlight: null,
};

export const messageKey = (role: "user" | "assistant", clientMessageId: string) =>
    `${role === "user" ? "u" : "a"}:${clientMessageId}`;

export function fromServerMessage(message: ChatMessage): UiMessage {
    return {
        key: messageKey(message.role, message.clientMessageId),
        id: message.id,
        role: message.role,
        clientMessageId: message.clientMessageId,
        content: message.content,
        blocks: message.blocks,
        status: message.status === "pending" ? "streaming" : message.status,
        error: message.error ? { ...message.error, retryable: true } : null,
        createdAt: message.createdAt,
        replayed: false,
        live: false,
        activity: null,
        stopped: false,
        suggestions: [],
    };
}

const textOf = (blocks: ChatBlock[]) =>
    blocks
        .filter((b): b is Extract<ChatBlock, { type: "text" }> => b?.type === "text")
        .map((b) => b.data.text)
        .join("\n\n");

function update(state: ChatState, key: string, fn: (m: UiMessage) => UiMessage): ChatState {
    return { ...state, messages: state.messages.map((m) => (m.key === key ? fn(m) : m)) };
}

function upsert(state: ChatState, message: UiMessage): ChatState {
    const exists = state.messages.some((m) => m.key === message.key);
    return exists
        ? update(state, message.key, () => message)
        : { ...state, messages: [...state.messages, message] };
}

function applyStreamEvent(state: ChatState, clientMessageId: string, event: SseEvent): ChatState {
    const userKey = messageKey("user", clientMessageId);
    const assistantKey = messageKey("assistant", clientMessageId);

    switch (event.event) {
        case "message.started": {
            const next = update(state, userKey, (m) => ({
                ...m,
                id: event.data.userMessageId,
                status: "completed",
                error: null,
            }));
            return upsert(next, {
                key: assistantKey,
                id: event.data.assistantMessageId,
                role: "assistant",
                clientMessageId,
                content: "",
                blocks: [],
                status: "streaming",
                error: null,
                createdAt: new Date().toISOString(),
                replayed: event.data.replay,
                live: !event.data.replay,
                activity: null,
                stopped: false,
                suggestions: [],
            });
        }
        case "text.delta":
            return update(state, assistantKey, (m) => {
                const blocks = [...m.blocks];
                const current = blocks[event.data.index];
                blocks[event.data.index] =
                    current?.type === "text"
                        ? { type: "text", data: { text: current.data.text + event.data.delta } }
                        : { type: "text", data: { text: event.data.delta } };
                return { ...m, blocks, content: textOf(blocks), activity: null };
            });
        case "block":
            return update(state, assistantKey, (m) => {
                const blocks = [...m.blocks];
                blocks[event.data.index] = event.data.block;
                return { ...m, blocks, activity: null };
            });
        case "status":
            return update(state, assistantKey, (m) =>
                m.status === "streaming" && !m.stopped ? { ...m, activity: event.data.label } : m,
            );
        case "suggestions":
            return update(state, assistantKey, (m) => (m.status === "completed" ? { ...m, suggestions: event.data.questions } : m));
        case "message.completed":
            return update(state, assistantKey, (m) => ({ ...fromServerMessage(event.data.message), replayed: m.replayed, live: m.live }));
        case "message.error":
            // Contract: discard partial output on error.
            return update(state, assistantKey, (m) => ({
                ...m,
                blocks: [],
                content: "",
                status: "failed",
                activity: null,
                error: {
                    code: event.data.error.code,
                    message: event.data.error.message,
                    retryable: event.data.error.retryable,
                },
            }));
    }
}

/** Merges a history page, skipping messages already present (by key). */
function mergeOlder(existing: UiMessage[], page: MessagePage): UiMessage[] {
    const known = new Set(existing.map((m) => m.key));
    return [...page.data.map(fromServerMessage).filter((m) => !known.has(m.key)), ...existing];
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
    switch (action.type) {
        case "conversation/loading":
            return { ...initialChatState, phase: "loading" };
        case "conversation/ready":
            return {
                ...initialChatState,
                phase: "ready",
                conversationId: action.conversationId,
                messages: action.page ? action.page.data.map(fromServerMessage) : [],
                history: {
                    hasMore: action.page?.pagination.hasMore ?? false,
                    nextCursor: action.page?.pagination.nextCursor ?? null,
                    loadingOlder: false,
                },
            };
        case "conversation/failed":
            return { ...state, phase: "error", loadError: action.message };
        case "history/loadingOlder":
            return { ...state, history: { ...state.history, loadingOlder: true } };
        case "history/olderLoaded":
            return {
                ...state,
                messages: mergeOlder(state.messages, action.page),
                history: {
                    hasMore: action.page.pagination.hasMore,
                    nextCursor: action.page.pagination.nextCursor,
                    loadingOlder: false,
                },
            };
        case "history/olderFailed":
            return { ...state, history: { ...state.history, loadingOlder: false } };
        case "send/start": {
            const userKey = messageKey("user", action.clientMessageId);
            const existing = state.messages.find((m) => m.key === userKey);
            const user: UiMessage = existing
                ? { ...existing, status: "sending", error: null }
                : {
                      key: userKey,
                      id: null,
                      role: "user",
                      clientMessageId: action.clientMessageId,
                      content: action.text,
                      blocks: [],
                      status: "sending",
                      error: null,
                      createdAt: action.at,
                      replayed: false,
                      live: false,
                      activity: null,
                      stopped: false,
                      suggestions: [],
                  };
            const assistantKey = messageKey("assistant", action.clientMessageId);
            // A retry replaces a previous *failed* reply; a completed one is never discarded.
            const messages = state.messages.filter((m) => m.key !== assistantKey || m.status !== "failed");
            return { ...upsert({ ...state, messages }, user), inFlight: action.clientMessageId };
        }
        case "send/failed": {
            state = state.inFlight === action.clientMessageId ? { ...state, inFlight: null } : state;
            const userKey = messageKey("user", action.clientMessageId);
            const assistantKey = messageKey("assistant", action.clientMessageId);
            const reply = state.messages.find((m) => m.key === assistantKey);
            // A rejected resend of an exchange that already completed leaves it untouched.
            if (reply?.status === "completed") {
                return update(state, userKey, (m) => ({ ...m, status: "completed", error: null }));
            }
            // If the stream had started, the failure belongs to the reply bubble.
            if (reply) {
                return update(state, assistantKey, (m) => ({ ...m, status: "failed", blocks: [], content: "", error: action.error }));
            }
            return update(state, userKey, (m) => ({ ...m, status: "failed", error: action.error }));
        }
        case "stop/requested":
            // No more typing out or "working" dots; what has arrived is shown at once.
            return update(state, messageKey("assistant", action.clientMessageId), (m) =>
                m.status === "streaming" ? { ...m, stopped: true, live: false, activity: null } : m,
            );
        case "stream/event": {
            const next = applyStreamEvent(state, action.clientMessageId, action.event);
            const finished = action.event.event === "message.completed" || action.event.event === "message.error";
            return finished && next.inFlight === action.clientMessageId ? { ...next, inFlight: null } : next;
        }
    }
}

/** True while this tab is sending a message or receiving its reply. */
export const isBusy = (state: ChatState) => state.inFlight !== null;
