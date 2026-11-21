
import type { ChatProvider } from "@property-assistant/llm";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Pool } from "pg";
import { config } from "./config.js";
import { pool as sharedPool } from "./db/pool.js";
import { AppError } from "./lib/errors.js";
import { ChatService } from "./modules/chat/chat.service.js";
import { MessageRepository } from "./modules/chat/message.repository.js";
import { ConversationRepository } from "./modules/conversations/conversation.repository.js";
import { CatalogLeadGateway, LeadService } from "./modules/leads/lead.service.js";
import { CatalogPropertyService } from "./modules/properties/catalog.service.js";
import { FixturePropertyService } from "./modules/properties/fixture.service.js";
import type { PropertyService } from "./modules/properties/property.service.js";
import { runForSite, SiteAwarePropertyService } from "./modules/properties/site-aware.service.js";
import { createProvider } from "./providers/factory.js";
import { conversationRoutes } from "./routes/conversations.js";
import { embedRoutes } from "./routes/embed.js";
import healthRoutes from "./routes/health.js";
import { leadRoutes } from "./routes/leads.js";
import { propertyRoutes } from "./routes/properties.js";

export interface BuildAppOptions {
    logger?: FastifyServerOptions["logger"];
    /** Defaults to the shared global pool. */
    db?: Pool;
    provider?: ChatProvider;
    messages?: MessageRepository;
    conversations?: ConversationRepository;
    /** Listing data for the model's tools and `GET /api/v1/properties`. */
    properties?: PropertyService;
    /** Where form requests go; by default as `LEADS_MODE` says. */
    leads?: LeadService;
    /** Browser origins allowed to call the API; defaults to `CORS_ORIGINS`. */
    corsOrigins?: readonly string[];
    /** Overrides CHAT_AUTH_SECRET in tests or an embedded deployment. */
    chatAuthSecret?: string;
    generationLeaseMs?: number;
}

/** Maps framework-level errors (bad JSON, body too large, …) to the API error shape. */
function fromFastifyError(error: { statusCode?: number; code?: string; message: string }): AppError {
    const status = error.statusCode ?? 500;
    if (status === 413) return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    if (status === 415) return new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    if (status >= 400 && status < 500) return new AppError(status, "VALIDATION_ERROR", error.message);
    return new AppError(500, "INTERNAL_ERROR", "Unexpected server error", { retryable: true });
}

export function buildApp(options: BuildAppOptions = {}) {
    const app = Fastify({
        logger: options.logger ?? { level: config.logLevel },
        bodyLimit: 64 * 1024,
    });

    const db = options.db ?? sharedPool;
    const conversations = options.conversations ?? new ConversationRepository();
    const messages = options.messages ?? new MessageRepository();
    // Lazy: nothing is fetched until a search needs it. Projects follow the website the widget is
    // open on (see the onRequest hook below); other callers get the configured source.
    const defaultProperties =
        config.propertySource === "fixtures"
            ? new FixturePropertyService()
            : new CatalogPropertyService({ ...config.catalog, log: app.log });
    const properties =
        options.properties ??
        new SiteAwarePropertyService(defaultProperties, (origin) =>
            config.propertySource === "fixtures"
                ? defaultProperties
                : new CatalogPropertyService({
                      ...config.catalog,
                      apiBaseUrl: `${origin}/api`,
                      mediaBaseUrl: config.catalog.mediaFollowsSite ? `${origin}/uploads/images` : config.catalog.mediaBaseUrl,
                      log: app.log,
                  }),
        );
    const leads =
        options.leads ??
        new LeadService(config.leads.mode === "catalog" ? new CatalogLeadGateway(config.leads) : null);
    const chat = new ChatService({
        db,
        conversations,
        messages,
        provider: options.provider ?? createProvider(app.log, properties, leads.enabled),
        generationLeaseMs: options.generationLeaseMs ?? config.generationLeaseMs,
    });

    // The widget on another site (e.g. example.com) calls the API from the browser. Only listed
    // origins are allowed. Headers go on the raw response so the SSE stream carries them too.
    const allowedOrigins = new Set(options.corsOrigins ?? config.corsOrigins);
    // Requests from an allowed website read that website's projects for everything they start.
    app.addHook("onRequest", (request, _reply, done) => {
        const origin = request.headers.origin;
        if (origin && allowedOrigins.has(origin)) runForSite(origin, done);
        else done();
    });
    app.addHook("onRequest", async (request, reply) => {
        const origin = request.headers.origin;
        if (!origin || !allowedOrigins.has(origin)) return;
        reply.raw.setHeader("access-control-allow-origin", origin);
        reply.raw.setHeader("vary", "Origin");
        reply.raw.setHeader("access-control-expose-headers", "Retry-After, Idempotent-Replayed");
        if (request.method === "OPTIONS") {
            reply.raw.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
        reply.raw.setHeader("access-control-allow-headers", "content-type, accept, authorization");
            reply.raw.setHeader("access-control-max-age", "600");
            return reply.code(204).send();
        }
    });

    app.setErrorHandler((error, request, reply) => {
        const appError = error instanceof AppError ? error : fromFastifyError(error as Error & { statusCode?: number });
        if (appError.statusCode >= 500) request.log.error({ err: error }, "request failed");
        return reply
            .code(appError.statusCode)
            .headers(appError.headers)
            .send({ error: appError.toBody(request.id) });
    });

    app.setNotFoundHandler((request, reply) => {
        return reply
            .code(404)
            .send({ error: new AppError(404, "NOT_FOUND", "Route not found").toBody(request.id) });
    });

    app.register(healthRoutes, { db });
    app.register(conversationRoutes, { db, chat, conversations, messages, chatAuthSecret: options.chatAuthSecret ?? config.chatAuth.sharedSecret });
    app.register(propertyRoutes, { properties });
    app.register(leadRoutes, { leads });
    app.register(embedRoutes, { file: config.embedFile });

    return app;
}
