
import {
    ConversationParamsSchema,
    CreateConversationRequestSchema,
    MessageParamsSchema,
    ListMessagesQuerySchema,
    SendMessageRequestSchema,
    type MessagePage,
    type StopMessageResponse,
} from "@property-assistant/contracts";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { conversationNotFound, parseInput } from "../lib/errors.js";
import { chatPrincipal } from "../lib/chat-auth.js";
import { SseStream } from "../lib/sse.js";
import type { ChatService } from "../modules/chat/chat.service.js";
import { toChatMessage, type MessageRepository } from "../modules/chat/message.repository.js";
import type { ConversationRepository } from "../modules/conversations/conversation.repository.js";

export interface ConversationRoutesOptions {
    db: Pool;
    chat: ChatService;
    conversations: ConversationRepository;
    messages: MessageRepository;
    chatAuthSecret: string;
}

/** Messages are at most MAX_MESSAGE_LENGTH (4,000) characters; this leaves room for JSON overhead and extra spaces. */
const MESSAGE_BODY_LIMIT = 32 * 1024;

export async function conversationRoutes(app: FastifyInstance, options: ConversationRoutesOptions) {
    const { db, chat, conversations, messages, chatAuthSecret } = options;

    app.post("/api/v1/conversations", async (request, reply) => {
        parseInput(CreateConversationRequestSchema, request.body ?? {}, "body");
        const principal = chatPrincipal(request, chatAuthSecret);
        const conversation = await conversations.create(db, principal?.subject ?? null);
        return reply.code(201).send({ data: conversation });
    });

    app.get("/api/v1/conversations", async (request) => {
        const principal = chatPrincipal(request, chatAuthSecret);
        // Anonymous conversations remain capability-based and are never enumerable.
        if (!principal) return { data: [] };
        return { data: await conversations.listByOwner(db, principal.subject) };
    });

    app.get("/api/v1/conversations/:conversationId", async (request) => {
        const { conversationId } = parseInput(ConversationParamsSchema, request.params, "path");
        const principal = chatPrincipal(request, chatAuthSecret);
        await conversations.assertAccess(db, conversationId, principal?.subject ?? null);
        const conversation = await conversations.findById(db, conversationId);
        if (!conversation) throw conversationNotFound();
        return { data: conversation };
    });

    // Deletes a conversation and all of its messages for good. Same access rule as reading it:
    // the owner for a signed-in conversation, anyone holding the id for an anonymous one.
    app.delete("/api/v1/conversations/:conversationId", async (request, reply) => {
        const { conversationId } = parseInput(ConversationParamsSchema, request.params, "path");
        const principal = chatPrincipal(request, chatAuthSecret);
        await conversations.assertAccess(db, conversationId, principal?.subject ?? null);
        chat.stopAll(conversationId);
        if (!(await conversations.delete(db, conversationId))) throw conversationNotFound();
        return reply.code(204).send();
    });

    app.get("/api/v1/conversations/:conversationId/messages", async (request): Promise<MessagePage> => {
        const { conversationId } = parseInput(ConversationParamsSchema, request.params, "path");
        const principal = chatPrincipal(request, chatAuthSecret);
        const { limit, before } = parseInput(ListMessagesQuerySchema, request.query, "query");
        const beforeSeq = before === undefined ? null : decodeCursor(before);

        await conversations.assertAccess(db, conversationId, principal?.subject ?? null);

        const { rows, blocks } = await messages.listPage(db, conversationId, limit, beforeSeq);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit).reverse(); // chronological order
        return {
            data: page.map((row) => toChatMessage(row, blocks.get(row.id) ?? [])),
            pagination: {
                limit,
                hasMore,
                nextCursor: hasMore && page[0] ? encodeCursor(page[0].seq) : null,
            },
        };
    });

    app.post(
        "/api/v1/conversations/:conversationId/messages",
        { bodyLimit: MESSAGE_BODY_LIMIT },
        async (request, reply) => {
            const { conversationId } = parseInput(ConversationParamsSchema, request.params, "path");
            const body = parseInput(SendMessageRequestSchema, request.body, "body");
            const principal = chatPrincipal(request, chatAuthSecret);
            await conversations.assertAccess(db, conversationId, principal?.subject ?? null);

            // Errors up to here (validation, 404, 409) are plain JSON responses.
            const claim = await chat.claim(conversationId, body);

            reply.hijack();
            const stream = new SseStream(reply.raw);
            stream.open({
                "X-Request-Id": request.id,
                ...(claim.kind === "replay" ? { "Idempotent-Replayed": "true" } : {}),
            });
            try {
                if (claim.kind === "replay") chat.replay(claim, stream.send);
                else await chat.generate(claim, stream.send, request.log, body.context ?? null);
            } catch (error) {
                request.log.error({ err: error }, "unexpected error while streaming");
                stream.send({
                    event: "message.error",
                    data: {
                        messageId: claim.assistant.id,
                        error: { code: "INTERNAL_ERROR", message: "Unexpected server error", retryable: true },
                    },
                });
            } finally {
                stream.end();
            }
            return reply;
        },
    );

    // Stops a reply this server is generating; what was already streamed is kept.
    app.post("/api/v1/conversations/:conversationId/messages/:messageId/stop", async (request): Promise<{ data: StopMessageResponse }> => {
        const { conversationId, messageId } = parseInput(MessageParamsSchema, request.params, "path");
        const principal = chatPrincipal(request, chatAuthSecret);
        // Preserve the stop endpoint's historical idempotency for an unknown id,
        // while still hiding an existing private conversation from other users.
        if (await conversations.exists(db, conversationId)) {
            await conversations.assertAccess(db, conversationId, principal?.subject ?? null);
        }
        return { data: { stopped: chat.stop(conversationId, messageId) } };
    });
}
