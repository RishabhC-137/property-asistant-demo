import type { ChatBlock, ChatMessage, ErrorCode, MessageStatus, StructuredBlock } from "@property-assistant/contracts";
import type { Queryable } from "../../db/pool.js";

export interface MessageRow {
    id: string;
    /** bigint — returned by pg as a string. */
    seq: string;
    conversation_id: string;
    client_message_id: string;
    role: "user" | "assistant";
    content: string;
    status: MessageStatus;
    reply_to_message_id: string | null;
    attempt: number;
    error: { code: ErrorCode; message: string } | null;
    generation_started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
}

interface BlockRow {
    message_id: string;
    position: number;
    type: ChatBlock["type"];
    data: ChatBlock["data"];
}

/** A block reduced to what conversation memory uses. */
export interface EarlierBlock {
    type: StructuredBlock["type"];
    title: string | null;
    projects: Array<{ id: string; name: string }>;
}

export interface EarlierMessage {
    role: "user" | "assistant";
    content: string;
    blocks: EarlierBlock[];
}

const COLUMNS = `id, seq, conversation_id, client_message_id, role, content, status,
    reply_to_message_id, attempt, error, generation_started_at, completed_at, created_at`;

const ASSISTANT_KEY = `conversation_id = $1 AND client_message_id = $2 AND role = 'assistant'`;

export function toChatMessage(row: MessageRow, blocks: ChatBlock[]): ChatMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        clientMessageId: row.client_message_id,
        status: row.status,
        content: row.content,
        blocks,
        replyToMessageId: row.reply_to_message_id,
        createdAt: row.created_at.toISOString(),
        completedAt: row.completed_at?.toISOString() ?? null,
        error: row.error,
    };
}

export class MessageRepository {
    /** Returns null when this clientMessageId was already used in the conversation. */
    async insertUserMessage(
        db: Queryable,
        input: { conversationId: string; clientMessageId: string; content: string },
    ): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(
            `INSERT INTO messages (conversation_id, client_message_id, role, content, status,
                                   completed_at, created_at, updated_at)
             VALUES ($1, $2, 'user', $3, 'completed', clock_timestamp(), clock_timestamp(), clock_timestamp())
             ON CONFLICT (conversation_id, client_message_id, role) DO NOTHING
             RETURNING ${COLUMNS}`,
            [input.conversationId, input.clientMessageId, input.content],
        );
        return rows[0] ?? null;
    }

    async findUserMessage(db: Queryable, conversationId: string, clientMessageId: string): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(
            `SELECT ${COLUMNS} FROM messages
             WHERE conversation_id = $1 AND client_message_id = $2 AND role = 'user'`,
            [conversationId, clientMessageId],
        );
        return rows[0] ?? null;
    }

    /** Creates the pending reply; null if a reply row for this key already exists. */
    async insertPendingAssistant(db: Queryable, user: MessageRow): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(
            `INSERT INTO messages (conversation_id, client_message_id, role, content, status, completed_at,
                                   reply_to_message_id, generation_started_at, created_at, updated_at)
             VALUES ($1, $2, 'assistant', '', 'pending', NULL, $3, clock_timestamp(), clock_timestamp(), clock_timestamp())
             ON CONFLICT (conversation_id, client_message_id, role) DO NOTHING
             RETURNING ${COLUMNS}`,
            [user.conversation_id, user.client_message_id, user.id],
        );
        return rows[0] ?? null;
    }

    async findAssistant(db: Queryable, conversationId: string, clientMessageId: string): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(`SELECT ${COLUMNS} FROM messages WHERE ${ASSISTANT_KEY}`, [
            conversationId,
            clientMessageId,
        ]);
        return rows[0] ?? null;
    }

    /**
     * Atomically takes over a failed reply, or a pending one whose generation
     * lease expired. The row lock + re-check means only one caller can win.
     */
    async reclaimAssistant(
        db: Queryable,
        conversationId: string,
        clientMessageId: string,
        leaseMs: number,
    ): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(
            `UPDATE messages
             SET status = 'pending', attempt = attempt + 1, error = NULL, content = '',
                 generation_started_at = clock_timestamp(), updated_at = clock_timestamp()
             WHERE ${ASSISTANT_KEY}
               AND (status = 'failed'
                    OR (status = 'pending'
                        AND generation_started_at < clock_timestamp() - ($3::double precision * interval '1 millisecond')))
             RETURNING ${COLUMNS}`,
            [conversationId, clientMessageId, leaseMs],
        );
        return rows[0] ?? null;
    }

    /**
     * Marks the reply completed only if this caller still owns the attempt.
     * Returns null when another attempt has taken over.
     */
    async completeAssistant(db: Queryable, id: string, attempt: number, content: string): Promise<MessageRow | null> {
        const { rows } = await db.query<MessageRow>(
            `UPDATE messages
             SET status = 'completed', content = $3, error = NULL,
                 completed_at = clock_timestamp(), updated_at = clock_timestamp()
             WHERE id = $1 AND status = 'pending' AND attempt = $2
             RETURNING ${COLUMNS}`,
            [id, attempt, content],
        );
        return rows[0] ?? null;
    }

    async markFailed(
        db: Queryable,
        id: string,
        attempt: number,
        error: { code: ErrorCode; message: string },
    ): Promise<void> {
        await db.query(
            `UPDATE messages SET status = 'failed', error = $3::jsonb, updated_at = clock_timestamp()
             WHERE id = $1 AND status = 'pending' AND attempt = $2`,
            [id, attempt, JSON.stringify(error)],
        );
    }

    async insertBlock(db: Queryable, messageId: string, position: number, block: ChatBlock): Promise<void> {
        await db.query(
            `INSERT INTO message_blocks (message_id, position, type, data) VALUES ($1, $2, $3, $4::jsonb)`,
            [messageId, position, block.type, JSON.stringify(block.data)],
        );
    }

    async findBlocks(db: Queryable, messageIds: string[]): Promise<Map<string, ChatBlock[]>> {
        const byMessage = new Map<string, ChatBlock[]>();
        if (messageIds.length === 0) return byMessage;
        const { rows } = await db.query<BlockRow>(
            `SELECT message_id, position, type, data FROM message_blocks
             WHERE message_id = ANY($1::uuid[])
             ORDER BY message_id, position`,
            [messageIds],
        );
        for (const row of rows) {
            const list = byMessage.get(row.message_id) ?? [];
            // Data was validated against the block schema before insertion.
            list.push({ type: row.type, data: row.data } as ChatBlock);
            byMessage.set(row.message_id, list);
        }
        return byMessage;
    }

    async findWithBlocks(db: Queryable, id: string): Promise<ChatMessage | null> {
        const { rows } = await db.query<MessageRow>(`SELECT ${COLUMNS} FROM messages WHERE id = $1`, [id]);
        const row = rows[0];
        if (!row) return null;
        const blocks = await this.findBlocks(db, [row.id]);
        return toChatMessage(row, blocks.get(row.id) ?? []);
    }

    /** Newest-first page of messages with `seq < beforeSeq`. Fetches limit + 1 to detect more. */
    async listPage(
        db: Queryable,
        conversationId: string,
        limit: number,
        beforeSeq: string | null,
    ): Promise<{ rows: MessageRow[]; blocks: Map<string, ChatBlock[]> }> {
        const { rows } = await db.query<MessageRow>(
            `SELECT ${COLUMNS} FROM messages
             WHERE conversation_id = $1 AND ($2::bigint IS NULL OR seq < $2::bigint)
             ORDER BY seq DESC
             LIMIT $3`,
            [conversationId, beforeSeq, limit + 1],
        );
        const assistantIds = rows.filter((r) => r.role === "assistant").map((r) => r.id);
        return { rows, blocks: await this.findBlocks(db, assistantIds) };
    }

    /** Completed messages before `beforeSeq`, oldest first, for provider context. */
    /**
     * Completed messages older than the `skip` most recent ones (the history
     * window), oldest first, with only what the conversation memory needs from
     * their blocks: titles and project names and ids, not whole cards.
     */
    async earlierActivity(
        db: Queryable,
        conversationId: string,
        beforeSeq: string,
        skip: number,
        limit: number,
    ): Promise<EarlierMessage[]> {
        const { rows } = await db.query<{ id: string; role: "user" | "assistant"; content: string }>(
            `SELECT id, role, content FROM (
                 SELECT id, role, left(content, 300) AS content, seq FROM messages
                 WHERE conversation_id = $1 AND seq < $2::bigint AND status = 'completed'
                 ORDER BY seq DESC OFFSET $3 LIMIT $4
             ) earlier ORDER BY seq ASC`,
            [conversationId, beforeSeq, skip, limit],
        );
        const assistantIds = rows.filter((r) => r.role === "assistant").map((r) => r.id);
        const blocks = new Map<string, EarlierBlock[]>();
        if (assistantIds.length > 0) {
            const { rows: blockRows } = await db.query<EarlierBlock & { message_id: string }>(
                `SELECT message_id, type, data->>'title' AS title,
                        CASE WHEN type = 'property_gallery'
                             THEN jsonb_build_array(jsonb_build_object('id', data->>'projectId', 'name', data->>'projectName'))
                             ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id', item->>'id', 'name', item->>'name'))
                                            FROM jsonb_array_elements(data->'items') item), '[]'::jsonb)
                        END AS projects
                 FROM message_blocks
                 WHERE message_id = ANY($1::uuid[])
                   AND type IN ('property_cards', 'property_comparison', 'property_gallery', 'lead_capture_form', 'site_visit_form')
                 ORDER BY message_id, position`,
                [assistantIds],
            );
            for (const { message_id, ...block } of blockRows) {
                blocks.set(message_id, [...(blocks.get(message_id) ?? []), block]);
            }
        }
        return rows.map(({ id, role, content }) => ({ role, content, blocks: blocks.get(id) ?? [] }));
    }

    async recentHistory(
        db: Queryable,
        conversationId: string,
        beforeSeq: string,
        limit: number,
    ): Promise<Array<{ role: "user" | "assistant"; content: string; blocks: StructuredBlock[] }>> {
        const { rows } = await db.query<{ id: string; role: "user" | "assistant"; content: string }>(
            `SELECT id, role, content FROM (
                 SELECT id, role, content, seq FROM messages
                 WHERE conversation_id = $1 AND seq < $2::bigint AND status = 'completed'
                 ORDER BY seq DESC LIMIT $3
             ) recent ORDER BY seq ASC`,
            [conversationId, beforeSeq, limit],
        );
        const blocks = await this.findBlocks(
            db,
            rows.filter((r) => r.role === "assistant").map((r) => r.id),
        );
        return rows.map(({ role, content, id }) => ({
            role,
            content,
            blocks: (blocks.get(id) ?? []).filter((b): b is StructuredBlock => b.type !== "text"),
        }));
    }
}
