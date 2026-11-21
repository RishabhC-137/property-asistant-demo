import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { pool as sharedPool } from "./pool.js";

/** Resolves to apps/api/migrations from both src/db and dist/db. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));
const MIGRATION_FILE = /^(\d{3})_[a-z0-9_]+\.sql$/;
/** Arbitrary constant so concurrent deploys don't run migrations twice. */
const ADVISORY_LOCK_KEY = 7_340_211;

export interface MigrationResult {
    applied: string[];
    skipped: string[];
}

/**
 * Applies pending `migrations/NNN_name.sql` files in order. Each file runs in
 * its own transaction and is recorded in `schema_migrations` with a checksum;
 * editing an already-applied file is an error. Migrations are forward-only and
 * must never drop or rewrite existing user data.
 */
export async function runMigrations(
    db: Pool = sharedPool,
    log: (message: string) => void = console.log,
): Promise<MigrationResult> {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => MIGRATION_FILE.test(f)).sort();
    const result: MigrationResult = { applied: [], skipped: [] };

    const client = await db.connect();
    let brokenConnection: Error | undefined;
    try {
        await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    text PRIMARY KEY,
                checksum   text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )`);
        const { rows } = await client.query<{ version: string; checksum: string }>(
            "SELECT version, checksum FROM schema_migrations",
        );
        const applied = new Map(rows.map((r) => [r.version, r.checksum]));

        for (const file of files) {
            const sql = await readFile(new URL(file, pathToFileURL(MIGRATIONS_DIR)), "utf8");
            const checksum = createHash("sha256").update(sql).digest("hex");
            const version = file.replace(/\.sql$/, "");
            const previous = applied.get(version);
            if (previous !== undefined) {
                if (previous !== checksum) {
                    throw new Error(`Migration ${file} was modified after being applied`);
                }
                result.skipped.push(version);
                continue;
            }
            try {
                await client.query("BEGIN");
                await client.query(sql);
                await client.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [
                    version,
                    checksum,
                ]);
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw new Error(`Migration ${file} failed and was rolled back: ${(error as Error).message}`, {
                    cause: error,
                });
            }
            log(`applied ${version}`);
            result.applied.push(version);
        }
    } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("Migration "))) {
            brokenConnection = error instanceof Error ? error : new Error(String(error));
        }
        throw error;
    } finally {
        if (!brokenConnection) {
            await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
        }
        client.release(brokenConnection);
    }
    return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runMigrations()
        .then(({ applied }) => console.log(applied.length ? `${applied.length} migration(s) applied` : "up to date"))
        .catch((error: unknown) => {
            console.error(error);
            process.exitCode = 1;
        })
        .finally(() => sharedPool.end());
}
