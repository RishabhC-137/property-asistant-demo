import type { Pool, PoolClient } from "pg";
import { pool as sharedPool } from "./pool.js";

/**
 * Runs `fn` inside BEGIN/COMMIT on a dedicated client from the pool.
 * Any error rolls back. The client is always released; if ROLLBACK itself
 * fails the connection is in an unknown state and is destroyed instead of
 * being returned to the pool.
 */
export async function withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    db: Pool = sharedPool,
): Promise<T> {
    const client = await db.connect();
    let brokenConnection: Error | undefined;
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            brokenConnection = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
        }
        throw error;
    } finally {
        client.release(brokenConnection);
    }
}
