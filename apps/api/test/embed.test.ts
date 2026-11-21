import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { testApp } from "./helpers.js";

describe("website widget", () => {
    it("lets listed sites call the API from the browser, and no others", async () => {
        const app = testApp({ corsOrigins: ["https://example.com"] });
        const preflight = await app.inject({
            method: "OPTIONS",
            url: "/api/v1/conversations",
            headers: { origin: "https://example.com", "access-control-request-method": "POST" },
        });
        assert.equal(preflight.statusCode, 204);
        assert.equal(preflight.headers["access-control-allow-origin"], "https://example.com");
        assert.match(String(preflight.headers["access-control-allow-headers"]), /content-type/);

        const ready = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://example.com" } });
        assert.equal(ready.headers["access-control-allow-origin"], "https://example.com");

        const other = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
        assert.equal(other.headers["access-control-allow-origin"], undefined);
    });
});

describe("GET /embed.js", () => {
    it("serves the built widget, or says it is not built", async () => {
        const dir = await mkdtemp(join(tmpdir(), "embed-"));
        const file = join(dir, "embed.js");
        await writeFile(file, "window.CatalogChat={};");
        const { embedRoutes } = await import("../src/routes/embed.js");
        const Fastify = (await import("fastify")).default;
        const app = Fastify();
        await app.register(embedRoutes, { file });
        const res = await app.inject({ method: "GET", url: "/embed.js" });
        assert.equal(res.statusCode, 200);
        assert.match(String(res.headers["content-type"]), /javascript/);
        assert.equal(res.body, "window.CatalogChat={};");
        assert.equal(res.headers["cache-control"], "no-cache");
        const again = await app.inject({ method: "GET", url: "/embed.js", headers: { "if-none-match": String(res.headers.etag) } });
        assert.equal(again.statusCode, 304);

        const missing = Fastify();
        missing.setErrorHandler((error, _req, reply) => reply.code((error as { statusCode?: number }).statusCode ?? 500).send());
        await missing.register(embedRoutes, { file: join(dir, "nope.js") });
        assert.equal((await missing.inject({ method: "GET", url: "/embed.js" })).statusCode, 404);
    });
});
