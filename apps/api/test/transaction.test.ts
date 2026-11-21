import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import { withTransaction } from "../src/db/transaction.js";
import { pool, resetDatabase } from "./helpers.js";

const exists = async (id: string) =>
    (await pool.query("SELECT 1 FROM conversations WHERE id = $1", [id])).rowCount === 1;

const checkedOut = () => pool.totalCount - pool.idleCount;

describe("withTransaction", () => {
    beforeEach(resetDatabase);
    after(() => pool.end());

    it("commits on success and releases the client", async () => {
        const id = randomUUID();
        await withTransaction((c) => c.query("INSERT INTO conversations (id) VALUES ($1)", [id]));
        assert.equal(await exists(id), true);
        assert.equal(checkedOut(), 0);
    });

    it("rolls back every statement when the callback throws", async () => {
        const id = randomUUID();
        await assert.rejects(
            withTransaction(async (c) => {
                await c.query("INSERT INTO conversations (id) VALUES ($1)", [id]);
                throw new Error("boom");
            }),
            /boom/,
        );
        assert.equal(await exists(id), false);
        assert.equal(checkedOut(), 0);
    });

    it("rolls back earlier writes when a later statement violates a constraint", async () => {
        const id = randomUUID();
        await assert.rejects(
            withTransaction(async (c) => {
                await c.query("INSERT INTO conversations (id) VALUES ($1)", [id]);
                await c.query(
                    `INSERT INTO messages (conversation_id, client_message_id, role, content)
                     VALUES ($1, 'm', 'robot', 'x')`,
                    [id],
                );
            }),
            /messages_role_check/,
        );
        assert.equal(await exists(id), false);
        assert.equal(checkedOut(), 0);
    });

    it("uses a dedicated client so concurrent transactions do not interfere", async () => {
        const kept = randomUUID();
        const dropped = randomUUID();
        await Promise.allSettled([
            withTransaction((c) => c.query("INSERT INTO conversations (id) VALUES ($1)", [kept])),
            withTransaction(async (c) => {
                await c.query("INSERT INTO conversations (id) VALUES ($1)", [dropped]);
                throw new Error("rollback me");
            }),
        ]);
        assert.equal(await exists(kept), true);
        assert.equal(await exists(dropped), false);
        assert.equal(checkedOut(), 0);
    });
});
