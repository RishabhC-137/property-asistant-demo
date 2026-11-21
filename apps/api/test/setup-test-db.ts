/**
 * Creates the dedicated test database if it does not exist and applies
 * migrations to it. Refuses to run against any database whose name does not
 * end in `_test`, so development data can never be touched by tests.
 */
import pg from "pg";
import { pool } from "../src/db/pool.js";
import { runMigrations } from "../src/db/migrate.js";

const database = process.env.PGDATABASE;
if (!database || !database.endsWith("_test") || process.env.DATABASE_URL) {
    console.error("Refusing to set up tests: PGDATABASE must end in _test and DATABASE_URL must be unset.");
    process.exit(1);
}

const admin = new pg.Client({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? process.env.USER,
    password: process.env.PGPASSWORD,
    database: "postgres",
});

try {
    await admin.connect();
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (rowCount === 0) {
        // Identifiers cannot be parameterized; the name was validated above.
        await admin.query(`CREATE DATABASE "${database.replace(/"/g, "")}"`);
        console.log(`created database ${database}`);
    }
    await admin.end();
    await runMigrations(pool, (m) => console.log(`[test db] ${m}`));
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await pool.end();
}
