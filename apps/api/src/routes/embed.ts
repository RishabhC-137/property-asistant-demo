import { readFile, stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";

export interface EmbedRoutesOptions {
    /** The built widget script (`npm run build:embed` in apps/web). */
    file: string;
}

/**
 * Serves the website widget, so a site needs only
 * `<script src="https://<chat-api>/embed.js">`. Re-read when the file changes.
 */
export async function embedRoutes(app: FastifyInstance, options: EmbedRoutesOptions) {
    let cached: { mtimeMs: number; body: Buffer } | null = null;

    app.get("/embed.js", async (request, reply) => {
        let info;
        try {
            info = await stat(options.file);
        } catch {
            throw new AppError(404, "NOT_FOUND", "The widget has not been built. Run npm run build:embed.");
        }
        if (!cached || cached.mtimeMs !== info.mtimeMs) cached = { mtimeMs: info.mtimeMs, body: await readFile(options.file) };
        // Browsers check back on every page load (a cheap 304 when unchanged), so a new build
        // reaches visitors right away instead of after a stale cached copy expires.
        const etag = `"${Math.round(cached.mtimeMs).toString(36)}-${cached.body.length.toString(36)}"`;
        reply.header("cache-control", "no-cache").header("etag", etag);
        if (request.headers["if-none-match"] === etag) return reply.code(304).send();
        return reply.header("content-type", "application/javascript; charset=utf-8").send(cached.body);
    });
}
