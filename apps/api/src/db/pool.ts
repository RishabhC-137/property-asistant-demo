
import { Pool, type PoolClient, type PoolConfig } from "pg";

/**
 * Connection settings come from `DATABASE_URL`, or the standard libpq
 * variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`).
 * Defaults match the original local setup.
 */
function poolConfig(): PoolConfig {
    const shared: PoolConfig = {
        max: Number(process.env.PG_POOL_MAX ?? 10),
        application_name: "property-assistant-api",
        statement_timeout: 10_000,
        idle_in_transaction_session_timeout: 30_000,
        connectionTimeoutMillis: 5_000,
    };
    if (process.env.DATABASE_URL) {
        return { ...shared, connectionString: process.env.DATABASE_URL };
    }
    return {
        ...shared,
        host: process.env.PGHOST ?? "127.0.0.1",
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? "property_assistant",
        user: process.env.PGUSER ?? process.env.USER,
        password: process.env.PGPASSWORD,
    };
}

/** Shared process-wide pool. Use `withTransaction` for multi-statement work. */
export const pool = new Pool(poolConfig());

// An idle client losing its connection must not crash the process.
pool.on("error", (error) => {
    console.error("Unexpected error on idle PostgreSQL client", error);
});

export type Queryable = Pool | PoolClient;
