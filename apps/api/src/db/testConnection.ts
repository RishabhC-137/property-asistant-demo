
import { pool } from "./pool.js";

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW() AS current_time");

        console.log("Connected to PostgreSQL!");
        console.log("Database time:", result.rows[0].current_time);
    } catch (error) {
        console.error("Database connection failed:", error);
    } finally {
        await pool.end();
    }
}

testConnection();
