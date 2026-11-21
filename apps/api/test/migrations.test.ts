import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { runMigrations } from "../src/db/migrate.js";
import { pool } from "./helpers.js";

/**
 * Recreates the pre-migration schema (as it existed in the development
 * database) in an isolated PostgreSQL schema, seeds legacy rows, and checks
 * that the migrations upgrade it without losing or corrupting data.
 */
const SCHEMA = `legacy_${process.pid}`;

const LEGACY_DDL = `
    CREATE TABLE conversations (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        client_message_id text NOT NULL,
        role text NOT NULL CHECK (role IN ('user', 'assistant')),
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (conversation_id, client_message_id, role)
    );`;

const CONV = "b33479fb-4d2c-445c-a32b-3826d0b03657";

describe("migrations", () => {
    let legacy: pg.Pool;

    before(async () => {
        await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await pool.query(`CREATE SCHEMA ${SCHEMA}`);
        legacy = new pg.Pool({
            host: process.env.PGHOST ?? "127.0.0.1",
            port: Number(process.env.PGPORT ?? 5432),
            database: process.env.PGDATABASE,
            user: process.env.PGUSER ?? process.env.USER,
            password: process.env.PGPASSWORD,
            options: `-c search_path=${SCHEMA}`,
            max: 2,
        });
        await legacy.query(LEGACY_DDL);
        await legacy.query("INSERT INTO conversations (id) VALUES ($1)", [CONV]);
        // msg-001: user message with no reply (what the old route could leave behind).
        // msg-002: a user + assistant pair, inserted assistant-first to test ordering.
        await legacy.query(
            `INSERT INTO messages (conversation_id, client_message_id, role, content, created_at) VALUES
             ($1, 'msg-002', 'assistant', 'Old reply', '2026-10-17T10:00:05Z'),
             ($1, 'msg-002', 'user', 'Second question', '2026-10-17T10:00:04Z'),
             ($1, 'msg-001', 'user', 'Show me 3 BHK flats in Metro', '2026-10-17T10:00:00Z')`,
            [CONV],
        );
    });

    after(async () => {
        await legacy.end();
        await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
        await pool.end();
    });

    it("upgrades a legacy database while preserving and backfilling rows", async () => {
        const result = await runMigrations(legacy, () => {});
        assert.deepEqual(result.applied, [
            "001_create_tables",
            "002_chat_persistence",
            "003_drop_request_hash",
            "004_user_message_length",
            "005_property_gallery_block",
            "006_payment_plan_block",
            "007_project_map_block",
            "008_conversation_owner",
            "009_project_details_block",
        ]);

        const { rows } = await legacy.query(
            `SELECT client_message_id, role, content, seq::int AS seq, status,
                    reply_to_message_id, attempt, completed_at = created_at AS completed_backfilled
             FROM messages ORDER BY seq`,
        );
        assert.equal(rows.length, 3, "no rows lost");
        assert.deepEqual(
            rows.map((r) => [r.client_message_id, r.role, r.seq]),
            [
                ["msg-001", "user", 1],
                ["msg-002", "user", 2],
                ["msg-002", "assistant", 3],
            ],
            "seq follows chronological order",
        );
        for (const row of rows) {
            assert.equal(row.status, "completed");
            assert.equal(row.attempt, 1);
            assert.equal(row.completed_backfilled, true);
        }
        assert.equal(rows[0].content, "Show me 3 BHK flats in Metro", "content preserved");
        const hashColumn = await legacy.query(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'messages' AND column_name = 'request_hash'",
            [SCHEMA],
        );
        assert.equal(hashColumn.rowCount, 0, "request_hash dropped by 003");

        const users = await legacy.query("SELECT id FROM messages WHERE client_message_id = 'msg-002' AND role = 'user'");
        assert.equal(rows[2].reply_to_message_id, users.rows[0].id, "assistant linked to its user message");

        const next = await legacy.query(
            `INSERT INTO messages (conversation_id, client_message_id, role, content)
             VALUES ($1, 'msg-003', 'user', 'x') RETURNING seq::int AS seq`,
            [CONV],
        );
        assert.equal(next.rows[0].seq, 4, "identity continues after backfilled values");
    });

    it("is idempotent", async () => {
        const result = await runMigrations(legacy, () => {});
        assert.deepEqual(result.applied, []);
        assert.deepEqual(result.skipped, [
            "001_create_tables",
            "002_chat_persistence",
            "003_drop_request_hash",
            "004_user_message_length",
            "005_property_gallery_block",
            "006_payment_plan_block",
            "007_project_map_block",
            "008_conversation_owner",
            "009_project_details_block",
        ]);
    });

    it("enforces the new constraints", async () => {
        await assert.rejects(
            legacy.query(
                `INSERT INTO messages (conversation_id, client_message_id, role, content)
                 VALUES ($1, 'too-long', 'user', repeat('x', 4001))`,
                [CONV],
            ),
            /messages_user_content_length_check/,
        );
        await assert.rejects(
            legacy.query(
                `INSERT INTO messages (conversation_id, client_message_id, role, content, status, completed_at)
                 VALUES ($1, 'orphan', 'assistant', 'x', 'pending', NULL)`,
                [CONV],
            ),
            /messages_reply_to_check/,
        );
        const msg = await legacy.query("SELECT id FROM messages WHERE role = 'assistant' LIMIT 1");
        await assert.rejects(
            legacy.query(`INSERT INTO message_blocks (message_id, position, type, data) VALUES ($1, 0, 'carousel', '{}')`, [
                msg.rows[0].id,
            ]),
            /message_blocks_type_check/,
        );
        await legacy.query(`INSERT INTO message_blocks (message_id, position, type, data) VALUES ($1, 0, 'text', '{"text":"a"}')`, [
            msg.rows[0].id,
        ]);
        await assert.rejects(
            legacy.query(`INSERT INTO message_blocks (message_id, position, type, data) VALUES ($1, 0, 'text', '{"text":"b"}')`, [
                msg.rows[0].id,
            ]),
            /message_blocks_message_position_key/,
        );
    });
});
