import { randomUUID } from "node:crypto";
import type { Conversation } from "@property-assistant/contracts";
import type { Queryable } from "../../db/pool.js";
import { conversationNotFound } from "../../lib/errors.js";

interface ConversationRow {
    id: string;
    owner_subject: string | null;
    created_at: Date;
    updated_at: Date;
    message_count: number;
    last_message_at: Date | null;
    title: string | null;
}

/** Long enough to recognise a conversation in a list. */
const TITLE_LENGTH = 80;

function toConversation(row: ConversationRow): Conversation {
    return {
        id: row.id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        messageCount: row.message_count,
        lastMessageAt: row.last_message_at?.toISOString() ?? null,
        title: row.title,
    };
}

export class ConversationRepository {
    async create(db: Queryable, ownerSubject: string | null = null): Promise<Conversation> {
        const { rows } = await db.query<ConversationRow>(
            `INSERT INTO conversations (id, owner_subject)
             VALUES ($1, $2)
             RETURNING id, owner_subject, created_at, updated_at, 0 AS message_count, NULL::timestamptz AS last_message_at, NULL::text AS title`,
            [randomUUID(), ownerSubject],
        );
        return toConversation(rows[0]!);
    }

    async findById(db: Queryable, id: string): Promise<Conversation | null> {
        const { rows } = await db.query<ConversationRow>(
            `SELECT c.id, c.owner_subject, c.created_at, c.updated_at,
                    COALESCE(stats.message_count, 0)::int AS message_count,
                    stats.last_message_at, first.title
             FROM conversations c
             LEFT JOIN LATERAL (
                 SELECT count(*) AS message_count, max(m.created_at) AS last_message_at
                 FROM messages m
                 WHERE m.conversation_id = c.id
             ) stats ON true
             LEFT JOIN LATERAL (
                 SELECT left(regexp_replace(m.content, '[[:space:]]+', ' ', 'g'), ${TITLE_LENGTH}) AS title
                 FROM messages m
                 WHERE m.conversation_id = c.id AND m.role = 'user'
                 ORDER BY m.seq
                 LIMIT 1
             ) first ON true
             WHERE c.id = $1`,
            [id],
        );
        return rows[0] ? toConversation(rows[0]) : null;
    }

    async listByOwner(db: Queryable, ownerSubject: string, limit = 20): Promise<Conversation[]> {
        const { rows } = await db.query<ConversationRow>(
            `SELECT c.id, c.owner_subject, c.created_at, c.updated_at,
                    COALESCE(stats.message_count, 0)::int AS message_count,
                    stats.last_message_at, first.title
             FROM conversations c
             LEFT JOIN LATERAL (
                 SELECT count(*) AS message_count, max(m.created_at) AS last_message_at
                 FROM messages m
                 WHERE m.conversation_id = c.id
             ) stats ON true
             LEFT JOIN LATERAL (
                 SELECT left(regexp_replace(m.content, '[[:space:]]+', ' ', 'g'), ${TITLE_LENGTH}) AS title
                 FROM messages m
                 WHERE m.conversation_id = c.id AND m.role = 'user'
                 ORDER BY m.seq
                 LIMIT 1
             ) first ON true
             WHERE c.owner_subject = $1
             ORDER BY COALESCE(stats.last_message_at, c.updated_at) DESC, c.id DESC
             LIMIT $2`,
            [ownerSubject, limit],
        );
        return rows.map(toConversation);
    }

    async exists(db: Queryable, id: string): Promise<boolean> {
        const { rowCount } = await db.query("SELECT 1 FROM conversations WHERE id = $1", [id]);
        return rowCount === 1;
    }

    /** A user-owned conversation is deliberately indistinguishable from a missing one to everyone else. */
    async assertAccess(db: Queryable, id: string, ownerSubject: string | null): Promise<void> {
        const { rows } = await db.query<{ owner_subject: string | null }>("SELECT owner_subject FROM conversations WHERE id = $1", [id]);
        const conversation = rows[0];
        if (!conversation || (conversation.owner_subject !== null && conversation.owner_subject !== ownerSubject)) {
            throw conversationNotFound();
        }
    }

    /** Removes the conversation; its messages and their blocks go with it (ON DELETE CASCADE). */
    async delete(db: Queryable, id: string): Promise<boolean> {
        const { rowCount } = await db.query("DELETE FROM conversations WHERE id = $1", [id]);
        return rowCount === 1;
    }

    async touch(db: Queryable, id: string): Promise<void> {
        await db.query("UPDATE conversations SET updated_at = clock_timestamp() WHERE id = $1", [id]);
    }
}
