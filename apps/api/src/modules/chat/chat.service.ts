import {
    ChatBlockSchema,
    StructuredBlockSchema,
    SuggestionsEventSchema,
    type ApiErrorBody,
    type ChatBlock,
    type ChatMessage,
    type ErrorCode,
    type SendMessageRequest,
} from "@property-assistant/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { Pool } from "pg";
import { withTransaction } from "../../db/transaction.js";
import { AppError, conversationNotFound, zodIssues } from "../../lib/errors.js";
import type { EmitEvent } from "../../lib/sse.js";
import { ProviderError, type ChatProvider, type PageContext } from "@property-assistant/llm";
import type { ConversationRepository } from "../conversations/conversation.repository.js";
import { buildMemory } from "./conversation-memory.js";
import { toChatMessage, type MessageRepository, type MessageRow } from "./message.repository.js";

const HISTORY_LIMIT = 20;
/** Messages before the history window that the conversation memory is built from. */
const MEMORY_SOURCE_LIMIT = 200;

export type ClaimResult =
    /** This request owns generation of `assistant` (attempt `assistant.attempt`). */
    | { kind: "generate"; user: MessageRow; assistant: MessageRow }
    /** A completed reply already exists; stream it back unchanged. */
    | { kind: "replay"; user: MessageRow; assistant: ChatMessage };

class GenerationError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
        readonly retryable: boolean,
        readonly details?: unknown,
        options?: { cause?: unknown },
    ) {
        super(message, options);
    }
}

export interface ChatServiceDeps {
    db: Pool;
    conversations: ConversationRepository;
    messages: MessageRepository;
    provider: ChatProvider;
    generationLeaseMs: number;
}

export class ChatService {
    /**
     * Replies generating in this process, so a user can stop one. With several
     * API instances, a stop must reach the instance generating it (sticky
     * routing or a shared channel); otherwise it reports nothing was stopped.
     */
    private readonly running = new Map<string, { conversationId: string; controller: AbortController }>();

    constructor(private readonly deps: ChatServiceDeps) {}

    /** Asks a generating reply to stop. What was already streamed is kept. */
    stop(conversationId: string, messageId: string): boolean {
        const entry = this.running.get(messageId);
        if (!entry || entry.conversationId !== conversationId) return false;
        entry.controller.abort();
        return true;
    }

    /** Stops every reply this process is generating for a conversation (e.g. it is being deleted). */
    stopAll(conversationId: string): void {
        for (const entry of this.running.values()) if (entry.conversationId === conversationId) entry.controller.abort();
    }

    /**
     * Idempotently records the user message and decides who answers it, in a
     * single short transaction:
     *  - new key           → insert user + pending assistant, caller generates
     *  - same key, payload → replay completed reply / 409 while in progress /
     *                        regenerate if the previous attempt failed or stalled
     *  - same key, other payload → 409 IDEMPOTENCY_KEY_REUSED
     * The unique (conversation_id, client_message_id, role) constraint makes
     * concurrent duplicates serialize on the insert, so only one can generate.
     */
    async claim(conversationId: string, input: SendMessageRequest): Promise<ClaimResult> {
        const { messages, conversations } = this.deps;

        const claimed = await withTransaction(async (client) => {
            if (!(await conversations.exists(client, conversationId))) throw conversationNotFound();

            let user = await messages.insertUserMessage(client, {
                conversationId,
                clientMessageId: input.clientMessageId,
                content: input.message,
            });
            if (user) {
                await conversations.touch(client, conversationId);
            } else {
                user = await messages.findUserMessage(client, conversationId, input.clientMessageId);
                if (!user) throw new Error("User message vanished during idempotency check");
                // Same key must mean the same (trimmed) message text.
                if (user.content !== input.message) {
                    throw new AppError(
                        409,
                        "IDEMPOTENCY_KEY_REUSED",
                        "This clientMessageId was already used with a different message. Use a new clientMessageId for a new message.",
                    );
                }
            }

            const created = await messages.insertPendingAssistant(client, user);
            if (created) return { kind: "generate" as const, user, assistant: created };

            const reclaimed = await messages.reclaimAssistant(
                client,
                conversationId,
                input.clientMessageId,
                this.deps.generationLeaseMs,
            );
            if (reclaimed) return { kind: "generate" as const, user, assistant: reclaimed };

            const existing = await messages.findAssistant(client, conversationId, input.clientMessageId);
            if (existing?.status === "completed") return { kind: "replay" as const, user, assistantId: existing.id };

            throw new AppError(409, "MESSAGE_IN_PROGRESS", "A reply to this message is still being generated", {
                retryable: true,
                headers: { "Retry-After": "1" },
            });
        }, this.deps.db);

        if (claimed.kind === "generate") return claimed;
        const assistant = await messages.findWithBlocks(this.deps.db, claimed.assistantId);
        if (!assistant) throw new Error("Completed reply disappeared before replay");
        return { kind: "replay", user: claimed.user, assistant };
    }

    /** Re-emits a persisted reply using the same event protocol as a live one. */
    replay(claim: Extract<ClaimResult, { kind: "replay" }>, emit: EmitEvent): void {
        const { user, assistant } = claim;
        emit({
            event: "message.started",
            data: {
                conversationId: assistant.conversationId,
                clientMessageId: assistant.clientMessageId,
                userMessageId: user.id,
                assistantMessageId: assistant.id,
                replay: true,
            },
        });
        assistant.blocks.forEach((block, index) => {
            if (block.type === "text") {
                emit({ event: "text.delta", data: { messageId: assistant.id, index, delta: block.data.text } });
            } else {
                emit({ event: "block", data: { messageId: assistant.id, index, block } });
            }
        });
        emit({ event: "message.completed", data: { message: assistant } });
    }

    /**
     * Streams the provider's response, then persists all blocks and marks the
     * reply completed in one transaction. On any failure the reply is marked
     * `failed` (so a retry with the same clientMessageId regenerates it) and a
     * `message.error` event is emitted. Already-streamed deltas must be
     * discarded by the client on `message.error`.
     *
     * Generation is not cancelled when the client disconnects; the persisted
     * result is replayed when the client retries.
     */
    async generate(
        claim: Extract<ClaimResult, { kind: "generate" }>,
        emit: EmitEvent,
        log: FastifyBaseLogger,
        page: PageContext | null = null,
    ): Promise<void> {
        const { user, assistant } = claim;
        const messageId = assistant.id;
        emit({
            event: "message.started",
            data: {
                conversationId: assistant.conversation_id,
                clientMessageId: assistant.client_message_id,
                userMessageId: user.id,
                assistantMessageId: messageId,
                replay: false,
            },
        });

        const controller = new AbortController();
        this.running.set(messageId, { conversationId: assistant.conversation_id, controller });
        let completed: ChatMessage | null = null;
        try {
            const blocks = await this.collect(user, messageId, emit, controller.signal, page);
            completed = await this.finalize(assistant, blocks);
            emit({ event: "message.completed", data: { message: completed } });
        } catch (error) {
            const failure =
                error instanceof GenerationError
                    ? error
                    : new GenerationError("INTERNAL_ERROR", "The assistant could not respond", true, undefined, {
                          cause: error,
                      });
            log.error({ err: error, messageId, code: failure.code }, "assistant generation failed");

            // A superseded attempt must not overwrite the newer attempt's state.
            if (failure.code !== "MESSAGE_IN_PROGRESS") {
                await this.deps.messages
                    .markFailed(this.deps.db, messageId, assistant.attempt, {
                        code: failure.code,
                        message: failure.message,
                    })
                    .catch((markError: unknown) =>
                        log.error({ err: markError, messageId }, "could not mark reply as failed"),
                    );
            }
            const body: ApiErrorBody = {
                code: failure.code,
                message: failure.message,
                retryable: failure.retryable,
                ...(failure.details !== undefined ? { details: failure.details } : {}),
            };
            emit({ event: "message.error", data: { messageId, error: body } });
        } finally {
            this.running.delete(messageId);
        }

        // Questions the user might ask next, once the reply is complete and saved. They are
        // never stored, and a stopped reply gets none.
        if (completed && !controller.signal.aborted && this.deps.provider.followUps) {
            const questions = await this.deps.provider
                .followUps({ message: user.content, reply: completed.blocks })
                .catch((error: unknown) => {
                    log.warn({ err: error, messageId }, "follow-up suggestions failed");
                    return [];
                });
            const parsed = SuggestionsEventSchema.shape.questions.safeParse(questions.map((q) => q.slice(0, 120)));
            if (parsed.success) emit({ event: "suggestions", data: { messageId, questions: parsed.data } });
        }
    }

    private async collect(
        user: MessageRow,
        messageId: string,
        emit: EmitEvent,
        signal: AbortSignal,
        page: PageContext | null,
    ): Promise<ChatBlock[]> {
        const history = await this.deps.messages.recentHistory(
            this.deps.db,
            user.conversation_id,
            user.seq,
            HISTORY_LIMIT,
        );
        // Only a conversation longer than the window has anything older to remember.
        const memory =
            history.length < HISTORY_LIMIT
                ? null
                : buildMemory(
                      await this.deps.messages.earlierActivity(
                          this.deps.db,
                          user.conversation_id,
                          user.seq,
                          HISTORY_LIMIT,
                          MEMORY_SOURCE_LIMIT,
                      ),
                  );
        const blocks: ChatBlock[] = [];
        const events = this.deps.provider.generate({
            conversationId: user.conversation_id,
            message: user.content,
            history,
            memory,
            page,
            signal,
        })[Symbol.asyncIterator]();
        // A stop must end the reply at once, not when the provider next yields (it may be mid-way
        // through a slow lookup or model call), so each wait races the stop.
        const stopped = new Promise<"stopped">((resolve) => {
            if (signal.aborted) resolve("stopped");
            else signal.addEventListener("abort", () => resolve("stopped"), { once: true });
        });

        try {
            for (;;) {
                const pending = events.next();
                const next = await Promise.race([pending, stopped]);
                // Stopped by the user: keep what was already streamed, and let the provider wind down unobserved.
                if (next === "stopped") {
                    pending.then(() => events.return?.(), () => {}).catch(() => {});
                    break;
                }
                if (next.done) break;
                const event = next.value;
                if (event.kind === "status") {
                    emit({ event: "status", data: { messageId, label: event.label.slice(0, 80) } });
                } else if (event.kind === "text") {
                    if (event.delta.length === 0) continue;
                    let last = blocks[blocks.length - 1];
                    if (last?.type !== "text") {
                        last = { type: "text", data: { text: "" } };
                        blocks.push(last);
                    }
                    last.data.text += event.delta;
                    emit({ event: "text.delta", data: { messageId, index: blocks.length - 1, delta: event.delta } });
                } else {
                    const parsed = StructuredBlockSchema.safeParse(event.block);
                    if (!parsed.success) {
                        throw new GenerationError(
                            "INVALID_PROVIDER_OUTPUT",
                            "The assistant produced an invalid response block",
                            true,
                            zodIssues(parsed.error),
                        );
                    }
                    blocks.push(parsed.data);
                    emit({ event: "block", data: { messageId, index: blocks.length - 1, block: parsed.data } });
                }
            }
        } catch (error) {
            if (error instanceof GenerationError) throw error;
            // A provider may throw when its request is aborted; a stop is not a failure.
            if (!signal.aborted) {
                const message =
                    error instanceof ProviderError ? error.userMessage : "The assistant could not respond. Please retry.";
                throw new GenerationError("PROVIDER_ERROR", message, true, undefined, { cause: error });
            }
        }

        if (signal.aborted && blocks.length === 0) {
            throw new GenerationError("CANCELLED", "You stopped this reply.", true);
        }

        if (blocks.length === 0) {
            throw new GenerationError("INVALID_PROVIDER_OUTPUT", "The assistant produced an empty response", true);
        }
        // Text blocks are assembled from deltas; validate the final result too.
        for (const block of blocks) {
            const parsed = ChatBlockSchema.safeParse(block);
            if (!parsed.success) {
                throw new GenerationError(
                    "INVALID_PROVIDER_OUTPUT",
                    "The assistant produced an invalid response",
                    true,
                    zodIssues(parsed.error),
                );
            }
        }
        return blocks;
    }

    private async finalize(assistant: MessageRow, blocks: ChatBlock[]): Promise<ChatMessage> {
        const content = blocks
            .filter((b) => b.type === "text")
            .map((b) => b.data.text)
            .join("\n\n");

        try {
            return await withTransaction(async (client) => {
                const completed = await this.deps.messages.completeAssistant(
                    client,
                    assistant.id,
                    assistant.attempt,
                    content,
                );
                if (!completed) {
                    throw new GenerationError(
                        "MESSAGE_IN_PROGRESS",
                        "This reply was superseded by a newer attempt",
                        true,
                    );
                }
                for (const [position, block] of blocks.entries()) {
                    await this.deps.messages.insertBlock(client, assistant.id, position, block);
                }
                await this.deps.conversations.touch(client, assistant.conversation_id);
                return toChatMessage(completed, blocks);
            }, this.deps.db);
        } catch (error) {
            if (error instanceof GenerationError) throw error;
            throw new GenerationError("PERSISTENCE_ERROR", "The reply could not be saved. Please retry.", true, undefined, {
                cause: error,
            });
        }
    }
}
