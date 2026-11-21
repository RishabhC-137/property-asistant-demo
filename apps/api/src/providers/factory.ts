import { GeminiChatProvider, MockChatProvider, SUBMISSION_API, SUBMISSION_DISABLED, type ChatProvider } from "@property-assistant/llm";
import type { FastifyBaseLogger } from "fastify";
import { config } from "../config.js";
import type { PropertyService } from "../modules/properties/property.service.js";

/** Builds the provider selected by `CHAT_PROVIDER`; fails fast on missing credentials. */
export function createProvider(log: FastifyBaseLogger, properties: PropertyService, leadsEnabled: boolean): ChatProvider {
    switch (config.chatProvider) {
        case "gemini":
            return new GeminiChatProvider({
                ...config.gemini,
                log,
                properties,
                // Forms say whether they really send, so the panel offers "Send" only when it does.
                formSubmission: leadsEnabled ? SUBMISSION_API : SUBMISSION_DISABLED,
            });
        case "mock":
            return new MockChatProvider({ chunkDelayMs: config.mockStreamDelayMs });
    }
}
