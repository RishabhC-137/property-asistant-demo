import {
    SSE_EVENT_NAMES,
    type ApiErrorResponse,
    type CardQuery,
    type Conversation,
    type CreateLeadRequest,
    type Lead,
    type ErrorCode,
    type MessagePage,
    type PropertyPage,
    type SendMessageRequest,
    type SseEvent,
} from "@property-assistant/contracts";
import { readSseStream } from "./sse.js";

/** Codes the client adds on top of the server's `ErrorCode`s. */
export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "STREAM_INTERRUPTED" | "ABORTED" | "BAD_RESPONSE";

export class ChatApiError extends Error {
    constructor(
        readonly code: ClientErrorCode,
        message: string,
        readonly retryable: boolean,
        readonly status: number | null = null,
        readonly retryAfterMs: number | null = null,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = "ChatApiError";
    }
}

export interface SendMessageOptions {
    onEvent: (event: SseEvent) => void;
    signal?: AbortSignal;
}

export interface ChatApiOptions {
    /** Obtains a short-lived site-issued identity ticket. It is kept out of storage. */
    getAuthToken?: () => Promise<string | null>;
}

/** Transport-level API. Swap the implementation to test or to use a different transport. */
export interface ChatApi {
    createConversation(): Promise<Conversation>;
    /** Signed-in visitors can resume their latest account-owned conversation on another device. */
    listConversations?(): Promise<Conversation[]>;
    getConversation(conversationId: string): Promise<Conversation>;
    /** Deletes a conversation and all its messages for good. */
    deleteConversation?(conversationId: string): Promise<void>;
    listMessages(conversationId: string, options?: { limit?: number; before?: string }): Promise<MessagePage>;
    /** Streams the reply; resolves after `message.completed` or `message.error`. */
    sendMessage(conversationId: string, body: SendMessageRequest, options: SendMessageOptions): Promise<void>;
    /** Asks the server to stop a reply it is generating; the open stream then ends normally. */
    stopMessage(conversationId: string, messageId: string): Promise<{ stopped: boolean }>;
    /** More results for a row of cards, by the search it came from. */
    searchProperties(query: CardQuery, options: { page: number; limit: number }): Promise<PropertyPage>;
    /** Sends a form's details; a code is sent to the phone to confirm them. */
    createLead(lead: CreateLeadRequest): Promise<Lead>;
    verifyLead(leadId: string, otp: string): Promise<Lead>;
    resendLeadCode(leadId: string): Promise<Lead>;
}

const KNOWN_EVENTS = new Set<string>(SSE_EVENT_NAMES);

async function toApiError(res: Response): Promise<ChatApiError> {
    const retryAfter = Number(res.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
    try {
        const body = (await res.json()) as ApiErrorResponse;
        const e = body.error;
        return new ChatApiError(e.code, e.message, e.retryable, res.status, retryAfterMs, e.details);
    } catch {
        return new ChatApiError("BAD_RESPONSE", `Unexpected response (HTTP ${res.status})`, res.status >= 500, res.status);
    }
}

function networkError(error: unknown): ChatApiError {
    if (error instanceof ChatApiError) return error;
    if (error instanceof DOMException && error.name === "AbortError") {
        return new ChatApiError("ABORTED", "Request was cancelled", true);
    }
    return new ChatApiError("NETWORK_ERROR", "Could not reach the server. Check your connection and retry.", true);
}

export function createChatApi(baseUrl: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), options: ChatApiOptions = {}): ChatApi {
    const root = baseUrl.replace(/\/+$/, "");

    async function headers(accept: string, supplied?: HeadersInit): Promise<HeadersInit> {
        const token = await options.getAuthToken?.();
        return { accept, ...(token ? { authorization: `Bearer ${token}` } : {}), ...supplied };
    }

    async function json<T>(path: string, init?: RequestInit): Promise<T> {
        let res: Response;
        try {
            res = await fetchImpl(`${root}${path}`, { ...init, headers: await headers("application/json", init?.headers) });
        } catch (error) {
            throw networkError(error);
        }
        if (!res.ok) throw await toApiError(res);
        return ((await res.json()) as { data: T }).data;
    }

    return {
        createConversation: () =>
            json<Conversation>("/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),

        listConversations: () => json<Conversation[]>("/conversations"),

        getConversation: (id) => json<Conversation>(`/conversations/${encodeURIComponent(id)}`),

        async deleteConversation(id) {
            let res: Response;
            try {
                res = await fetchImpl(`${root}/conversations/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                    headers: await headers("application/json"),
                });
            } catch (error) {
                throw networkError(error);
            }
            // Already gone (or never this visitor's) is the outcome they asked for.
            if (!res.ok && res.status !== 404) throw await toApiError(res);
        },

        stopMessage: (id, messageId) =>
            json<{ stopped: boolean }>(
                `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/stop`,
                { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
            ),

        async listMessages(id, options = {}) {
            const query = new URLSearchParams();
            if (options.limit) query.set("limit", String(options.limit));
            if (options.before) query.set("before", options.before);
            const qs = query.size > 0 ? `?${query}` : "";
            let res: Response;
            try {
                res = await fetchImpl(`${root}/conversations/${encodeURIComponent(id)}/messages${qs}`, {
                    headers: await headers("application/json"),
                });
            } catch (error) {
                throw networkError(error);
            }
            if (!res.ok) throw await toApiError(res);
            return (await res.json()) as MessagePage;
        },

        createLead: (lead) =>
            json<Lead>("/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) }),

        verifyLead: (leadId, otp) =>
            json<Lead>(`/leads/${encodeURIComponent(leadId)}/verify`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ otp }),
            }),

        resendLeadCode: (leadId) =>
            json<Lead>(`/leads/${encodeURIComponent(leadId)}/resend`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            }),

        async searchProperties(query, { page, limit }) {
            const params = new URLSearchParams({ page: String(page), limit: String(limit) });
            for (const [key, value] of Object.entries(query)) if (value !== null) params.set(key, String(value));
            let res: Response;
            try {
                res = await fetchImpl(`${root}/properties?${params}`, { headers: await headers("application/json") });
            } catch (error) {
                throw networkError(error);
            }
            if (!res.ok) throw await toApiError(res);
            return (await res.json()) as PropertyPage;
        },

        async sendMessage(id, body, { onEvent, signal }) {
            let res: Response;
            try {
                res = await fetchImpl(`${root}/conversations/${encodeURIComponent(id)}/messages`, {
                    method: "POST",
                    headers: await headers("text/event-stream", { "content-type": "application/json" }),
                    body: JSON.stringify(body),
                    signal: signal ?? null,
                });
            } catch (error) {
                throw networkError(error);
            }
            // Validation, 404 and idempotency conflicts arrive as JSON before any stream.
            if (!res.ok) throw await toApiError(res);
            if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
                throw new ChatApiError("BAD_RESPONSE", "Expected an event stream", true, res.status);
            }

            let finished = false;
            try {
                await readSseStream(res.body, (raw) => {
                    if (!KNOWN_EVENTS.has(raw.event)) return; // ignore unknown events (forward compatible)
                    const event = { event: raw.event, data: JSON.parse(raw.data) } as SseEvent;
                    if (event.event === "message.completed" || event.event === "message.error") finished = true;
                    onEvent(event);
                });
            } catch (error) {
                throw networkError(error);
            }
            if (!finished) {
                throw new ChatApiError(
                    "STREAM_INTERRUPTED",
                    "The connection closed before the reply finished. Retry to load it.",
                    true,
                );
            }
        },
    };
}
