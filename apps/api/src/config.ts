function intFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
    }
    return value;
}

function oneOfFromEnv<const T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    if (!(allowed as readonly string[]).includes(raw)) {
        throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${raw}"`);
    }
    return raw as T;
}

export const config = {
    port: intFromEnv("PORT", 4000),
    host: process.env.HOST ?? "127.0.0.1",
    logLevel: process.env.LOG_LEVEL ?? "info",
    /** Delay between mock text chunks so streaming is visible in development. */
    mockStreamDelayMs: intFromEnv("MOCK_STREAM_DELAY_MS", 15),
    /** A pending reply older than this is considered abandoned and may be regenerated. */
    generationLeaseMs: intFromEnv("GENERATION_LEASE_MS", 120_000),
    /** Which provider answers messages. */
    chatProvider: oneOfFromEnv("CHAT_PROVIDER", ["mock", "gemini"], "mock"),
    gemini: {
        apiKey: process.env.GEMINI_API_KEY ?? "",
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
        /** Used when the main model is rate-limited (separate quota). Set to "" to disable. */
        fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
        /** Upstream request timeout; keep it below GENERATION_LEASE_MS. */
        timeoutMs: intFromEnv("GEMINI_TIMEOUT_MS", 60_000),
        /** "minimal" | "low" | "medium" | "high"; "" keeps the model's default. Lower is faster and cheaper. */
        thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? "low",
    },
    catalog: {
        /** Used for requests that do not come from an allowed website (the widget's site wins otherwise). */
        apiBaseUrl: (process.env.PROPERTY_DESK_API_URL || "https://example.com/api").replace(/\/+$/, ""),
        /** Project images live at `{mediaBaseUrl}/{slug}/{file}`. Set to "" to leave image URLs unset. */
        mediaBaseUrl:
            (process.env.PROPERTY_DESK_MEDIA_URL ?? "https://example.com/uploads/images").replace(/\/+$/, "") ||
            null,
        /** With no PROPERTY_DESK_MEDIA_URL set, images come from the website the widget is open on. */
        mediaFollowsSite: process.env.PROPERTY_DESK_MEDIA_URL === undefined,
        timeoutMs: intFromEnv("PROPERTY_DESK_TIMEOUT_MS", 10_000),
        /** How long the fetched project catalogue is reused before refreshing. */
        cacheTtlMs: intFromEnv("PROPERTY_DESK_CACHE_TTL_MS", 600_000),
    },
    /** Sites allowed to call the API from the browser (the embedded widget), e.g. "https://example.com". Comma-separated. */
    corsOrigins: (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    /** HMAC secret shared only with Property Desk for short-lived chat identity tickets. */
    chatAuth: {
        sharedSecret: process.env.CHAT_AUTH_SECRET ?? "",
    },
    /** The built website widget (`npm run build:embed`), served at `/embed.js`. */
    embedFile: process.env.EMBED_FILE || new URL("../../web/dist-embed/embed.js", import.meta.url).pathname,
    leads: {
        /**
         * "catalog": callback and site-visit forms are sent to the website's enquiry API and
         * confirmed with a WhatsApp code. "disabled": forms collect details but send them nowhere.
         */
        mode: oneOfFromEnv("LEADS_MODE", ["disabled", "catalog"], "disabled"),
        /** The website API with `/enquiry/create` and `/enquiry/verify-otp`. */
        apiBaseUrl: (process.env.LEADS_API_URL || process.env.PROPERTY_DESK_API_URL || "https://example.com/api").replace(/\/+$/, ""),
        timeoutMs: intFromEnv("LEADS_TIMEOUT_MS", 15_000),
    },
} as const;
