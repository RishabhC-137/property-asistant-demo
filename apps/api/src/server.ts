
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";

const start = async () => {
    const app = buildApp();

    const shutdown = async (signal: string) => {
        app.log.info({ signal }, "shutting down");
        await app.close();
        await pool.end();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));

    try {
        app.log.info({
            provider: config.chatProvider,
            model: config.chatProvider === "gemini" ? config.gemini.model : null,
            propertySource: config.propertySource,
        }, "assistant configuration");
        await app.listen({
            port: config.port,
            host: config.host,
        });
    } catch (error) {
        app.log.error(error);
        await app.close();
        await pool.end();
        process.exitCode = 1;
    }
};

start();
