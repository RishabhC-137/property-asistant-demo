import { MAX_MESSAGE_LENGTH, normalizeMessage, type MessageContext, type SseEvent } from "@property-assistant/contracts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChatApiError, type ChatApi } from "../api/client.js";
import { chatReducer, initialChatState, isBusy, messageKey, type ChatState } from "./chatReducer.js";

/** Everything that crosses the wire, for debugging tools. */
export type ChatDebugEvent =
    | { direction: "out"; at: string; name: string; data: unknown }
    | { direction: "in"; at: string; name: SseEvent["event"] | "http.error"; data: unknown };

export interface UseChatOptions {
    api: ChatApi;
    /** localStorage key for the conversation id; null disables persistence. */
    storageKey?: string | null;
    onEvent?: (event: ChatDebugEvent) => void;
    historyPageSize?: number;
    /** Sent with each message, e.g. the project page the chat is on. A function is read at send time. */
    context?: MessageContext | (() => MessageContext | undefined);
}

export interface UseChatResult {
    state: ChatState;
    busy: boolean;
    send: (text: string) => boolean;
    /** Stops the reply being generated, keeping what has arrived. */
    stop: () => void;
    /** True between pressing stop and the reply ending. */
    stopping: boolean;
    retry: (clientMessageId: string) => void;
    loadOlder: () => void;
    newConversation: () => void;
    /** Past conversations on this device and, for a signed-in visitor, their account; newest first. */
    listConversations: () => Promise<ConversationSummary[]>;
    openConversation: (conversationId: string) => void;
    /** Deletes a conversation for good; deleting the open one starts a new chat. */
    deleteConversation: (conversationId: string) => Promise<void>;
    validate: (text: string) => string | null;
}

export interface ConversationSummary {
    id: string;
    /** The first message, shortened; null when nothing was sent yet. */
    title: string | null;
    /** When it was last used. */
    at: string;
}

const now = () => new Date().toISOString();

function readStorage(key: string | null): string | null {
    if (!key) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string | null, value: string): void {
    if (!key) return;
    try {
        localStorage.setItem(key, value);
    } catch {
        // storage unavailable (private mode, blocked): the chat still works for this page
    }
}

/** How many conversations this device remembers for the history list. */
const HISTORY_LIMIT = 30;
const TITLE_LENGTH = 80;

const historyKey = (key: string) => `${key}:history`;

function readHistory(key: string | null): ConversationSummary[] {
    const raw = key ? readStorage(historyKey(key)) : null;
    if (!raw) return [];
    try {
        const list: unknown = JSON.parse(raw);
        return Array.isArray(list)
            ? list.filter((e): e is ConversationSummary => typeof e?.id === "string" && typeof e?.at === "string")
            : [];
    } catch {
        return [];
    }
}

function writeHistory(key: string | null, list: ConversationSummary[]): void {
    if (key) writeStorage(historyKey(key), JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}

/** Anonymous conversations are not listed by the server, so the device keeps their ids. */
function rememberConversation(key: string | null, id: string, text: string): void {
    const list = readHistory(key);
    const title = list.find((e) => e.id === id)?.title ?? text.replace(/\s+/g, " ").slice(0, TITLE_LENGTH);
    writeHistory(key, [{ id, title, at: now() }, ...list.filter((e) => e.id !== id)]);
}

export function useChat({
    api,
    storageKey = "rec-chat:conversationId",
    onEvent,
    historyPageSize = 30,
    context,
}: UseChatOptions): UseChatResult {
    const [state, dispatch] = useReducer(chatReducer, initialChatState);
    const stateRef = useRef(state);
    stateRef.current = state;
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const contextRef = useRef(context);
    contextRef.current = context;
    const abortRef = useRef<AbortController | null>(null);
    const bootstrapped = useRef(false);

    const emit = (event: ChatDebugEvent) => onEventRef.current?.(event);

    const startNew = useCallback(async () => {
        abortRef.current?.abort();
        dispatch({ type: "conversation/loading" });
        try {
            const conversation = await api.createConversation();
            writeStorage(storageKey, conversation.id);
            dispatch({ type: "conversation/ready", conversationId: conversation.id, page: null });
        } catch (error) {
            dispatch({ type: "conversation/failed", message: (error as Error).message });
        }
    }, [api, storageKey]);

    const resumeLatestOrStart = useCallback(async () => {
        try {
            const latest = (await api.listConversations?.())?.[0];
            if (!latest) {
                await startNew();
                return;
            }
            const page = await api.listMessages(latest.id, { limit: historyPageSize });
            writeStorage(storageKey, latest.id);
            dispatch({ type: "conversation/ready", conversationId: latest.id, page });
        } catch (error) {
            dispatch({ type: "conversation/failed", message: (error as Error).message });
        }
    }, [api, historyPageSize, startNew, storageKey]);

    // Resume the stored conversation, or create one. Re-runs when the storage
    // key changes (e.g. a different user signs in on the same device).
    const prevKeyRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        const firstRun = !bootstrapped.current;
        const keyChanged = prevKeyRef.current !== undefined && prevKeyRef.current !== storageKey;
        prevKeyRef.current = storageKey;
        if (!firstRun && !keyChanged) return;
        bootstrapped.current = true;
        abortRef.current?.abort();
        const storedId = readStorage(storageKey);
        if (!storedId) {
            void resumeLatestOrStart();
            return;
        }
        dispatch({ type: "conversation/loading" });
        api.listMessages(storedId, { limit: historyPageSize })
            .then((page) => dispatch({ type: "conversation/ready", conversationId: storedId, page }))
            .catch((error: unknown) => {
                // Stale or invalid id → start fresh instead of showing an error.
                if (error instanceof ChatApiError && (error.status === 404 || error.status === 400)) void startNew();
                else dispatch({ type: "conversation/failed", message: (error as Error).message });
            });
    }, [api, storageKey, historyPageSize, startNew, resumeLatestOrStart]);

    useEffect(() => () => abortRef.current?.abort(), []);

    /** The request whose reply the user asked to stop (its server id may not be known yet). */
    const [stoppingId, setStoppingId] = useState<string | null>(null);
    const stopWhenStarted = useRef<string | null>(null);

    const requestStop = useCallback(
        (conversationId: string, messageId: string) => {
            emit({ direction: "out", at: now(), name: "POST /stop", data: { messageId } });
            // If the reply already finished, there is nothing to stop and the stream ends anyway.
            api.stopMessage(conversationId, messageId).catch(() => {});
        },
        [api],
    );

    const run = useCallback(
        async (clientMessageId: string, text: string) => {
            const conversationId = stateRef.current.conversationId;
            if (!conversationId) return;
            const controller = new AbortController();
            abortRef.current = controller;
            dispatch({ type: "send/start", clientMessageId, text, at: now() });
            rememberConversation(storageKey, conversationId, text);
            const current = typeof contextRef.current === "function" ? contextRef.current() : contextRef.current;
            const context = current?.projectId || current?.projectIds?.length || current?.pageContent ? current : undefined;
            const body = { clientMessageId, message: text, ...(context ? { context } : {}) };
            emit({ direction: "out", at: now(), name: "POST /messages", data: body });
            try {
                await api.sendMessage(
                    conversationId,
                    body,
                    {
                        signal: controller.signal,
                        onEvent: (event) => {
                            emit({ direction: "in", at: now(), name: event.event, data: event.data });
                            dispatch({ type: "stream/event", clientMessageId, event });
                            // Stop was pressed before the server said which reply it is generating.
                            if (event.event === "message.started" && stopWhenStarted.current === clientMessageId) {
                                stopWhenStarted.current = null;
                                dispatch({ type: "stop/requested", clientMessageId });
                                requestStop(conversationId, event.data.assistantMessageId);
                            }
                        },
                    },
                );
            } catch (error) {
                const e =
                    error instanceof ChatApiError
                        ? error
                        : new ChatApiError("NETWORK_ERROR", (error as Error).message, true);
                emit({
                    direction: "in",
                    at: now(),
                    name: "http.error",
                    data: { status: e.status, code: e.code, message: e.message },
                });
                if (e.code !== "ABORTED") {
                    dispatch({
                        type: "send/failed",
                        clientMessageId,
                        error: { code: e.code, message: e.message, retryable: e.retryable },
                    });
                }
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
            }
        },
        [api, requestStop, storageKey],
    );

    const stop = useCallback(() => {
        const { inFlight, conversationId, messages } = stateRef.current;
        if (!inFlight || !conversationId) return;
        setStoppingId(inFlight);
        dispatch({ type: "stop/requested", clientMessageId: inFlight });
        const reply = messages.find((m) => m.key === messageKey("assistant", inFlight));
        if (reply?.id) requestStop(conversationId, reply.id);
        else stopWhenStarted.current = inFlight;
    }, [requestStop]);

    const validate = useCallback((text: string): string | null => {
        const normalized = normalizeMessage(text);
        if (normalized.length === 0) return "Type a message";
        if (normalized.length > MAX_MESSAGE_LENGTH) {
            return `Message is too long (${normalized.length}/${MAX_MESSAGE_LENGTH})`;
        }
        return null;
    }, []);

    const send = useCallback(
        (text: string) => {
            if (validate(text) || isBusy(stateRef.current) || stateRef.current.phase !== "ready") return false;
            void run(crypto.randomUUID(), normalizeMessage(text));
            return true;
        },
        [run, validate],
    );

    /** Resends with the SAME clientMessageId — the server replays or regenerates. */
    const retry = useCallback(
        (clientMessageId: string) => {
            if (isBusy(stateRef.current)) return;
            const user = stateRef.current.messages.find((m) => m.key === messageKey("user", clientMessageId));
            if (user) void run(clientMessageId, user.content);
        },
        [run],
    );

    const loadOlder = useCallback(() => {
        const { conversationId, history } = stateRef.current;
        if (!conversationId || !history.hasMore || !history.nextCursor || history.loadingOlder) return;
        dispatch({ type: "history/loadingOlder" });
        api.listMessages(conversationId, { limit: historyPageSize, before: history.nextCursor })
            .then((page) => dispatch({ type: "history/olderLoaded", page }))
            .catch(() => dispatch({ type: "history/olderFailed" }));
    }, [api, historyPageSize]);

    const newConversation = useCallback(() => void startNew(), [startNew]);

    const listConversations = useCallback(async (): Promise<ConversationSummary[]> => {
        const byId = new Map<string, ConversationSummary>();
        try {
            for (const c of (await api.listConversations?.()) ?? []) {
                if (c.messageCount > 0) byId.set(c.id, { id: c.id, title: c.title, at: c.lastMessageAt ?? c.updatedAt });
            }
        } catch {
            // The device's own list still works without the account's.
        }
        for (const entry of readHistory(storageKey)) if (!byId.has(entry.id)) byId.set(entry.id, entry);
        return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
    }, [api, storageKey]);

    const openConversation = useCallback(
        (conversationId: string) => {
            if (isBusy(stateRef.current) || conversationId === stateRef.current.conversationId) return;
            abortRef.current?.abort();
            dispatch({ type: "conversation/loading" });
            api.listMessages(conversationId, { limit: historyPageSize })
                .then((page) => {
                    writeStorage(storageKey, conversationId);
                    dispatch({ type: "conversation/ready", conversationId, page });
                })
                .catch((error: unknown) => {
                    // Gone, or not this visitor's: drop it from the list and start fresh.
                    if (error instanceof ChatApiError && (error.status === 404 || error.status === 400)) {
                        writeHistory(storageKey, readHistory(storageKey).filter((e) => e.id !== conversationId));
                        void startNew();
                    } else dispatch({ type: "conversation/failed", message: (error as Error).message });
                });
        },
        [api, historyPageSize, startNew, storageKey],
    );

    const deleteConversation = useCallback(
        async (conversationId: string) => {
            await api.deleteConversation?.(conversationId);
            writeHistory(storageKey, readHistory(storageKey).filter((e) => e.id !== conversationId));
            if (stateRef.current.conversationId === conversationId) {
                abortRef.current?.abort();
                await startNew();
            }
        },
        [api, startNew, storageKey],
    );

    const stopping = stoppingId !== null && state.inFlight === stoppingId;
    return useMemo(
        () => ({ state, busy: isBusy(state), send, stop, stopping, retry, loadOlder, newConversation, listConversations, openConversation, deleteConversation, validate }),
        [state, send, stop, stopping, retry, loadOlder, newConversation, listConversations, openConversation, deleteConversation, validate],
    );
}
