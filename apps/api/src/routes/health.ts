import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const READY_TIMEOUT_MS = 2_000;

export default async function healthRoutes(app: FastifyInstance, options: { db: Pool }) {
    /** Liveness: the process is up. Never touches dependencies. */
    app.get("/health", async () => {
        return {
            status: "ok",
            service: "property-assistant",
        };
    });

    /** Readiness: PostgreSQL answers a trivial query within the timeout. */
    app.get("/ready", async (request, reply) => {
        let timer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([
                options.db.query("SELECT 1"),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("database readiness check timed out")), READY_TIMEOUT_MS);
                }),
            ]);
            return { status: "ready", checks: { database: "ok" } };
        } catch (error) {
            request.log.warn({ err: error }, "readiness check failed");
            return reply.code(503).send({ status: "not_ready", checks: { database: "unavailable" } });
        } finally {
            clearTimeout(timer);
        }
    });
}
