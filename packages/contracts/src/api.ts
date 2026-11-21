import { z } from "zod";
import { ChatBlockSchema } from "./blocks.js";
import { IsoDateSchema, IsoDateTimeSchema, safeText, UuidSchema } from "./common.js";
import { PropertyCardSchema } from "./property.js";

// ---------------------------------------------------------------- errors

export const ERROR_CODES = [
    "VALIDATION_ERROR",
    "INVALID_CURSOR",
    "UNAUTHORIZED",
    "CONVERSATION_NOT_FOUND",
    "NOT_FOUND",
    "IDEMPOTENCY_KEY_REUSED",
    "MESSAGE_IN_PROGRESS",
    "PROVIDER_ERROR",
    "INVALID_PROVIDER_OUTPUT",
    "CANCELLED",
    "PERSISTENCE_ERROR",
    "PAYLOAD_TOO_LARGE",
    "UNSUPPORTED_MEDIA_TYPE",
    "SERVICE_UNAVAILABLE",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const ApiErrorResponseSchema = z.object({ error: ApiErrorBodySchema });
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ---------------------------------------------------------------- conversations

/** Body is optional; no fields are accepted yet (unknown keys are rejected). */
export const CreateConversationRequestSchema = z.strictObject({});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export const ConversationSchema = z.object({
    id: UuidSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    messageCount: z.number().int().nonnegative(),
    lastMessageAt: IsoDateTimeSchema.nullable(),
    /** The visitor's first message, shortened, for history lists; null before anything is sent. */
    title: z.string().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationParamsSchema = z.object({ conversationId: UuidSchema });
export const MessageParamsSchema = z.object({ conversationId: UuidSchema, messageId: UuidSchema });

/** `POST …/messages/:messageId/stop`: whether a reply was generating and has been told to stop. */
export const StopMessageResponseSchema = z.object({ stopped: z.boolean() });
export type StopMessageResponse = z.infer<typeof StopMessageResponseSchema>;

// ---------------------------------------------------------------- messages

export const MessageRoleSchema = z.enum(["user", "assistant"]);
export const MessageStatusSchema = z.enum(["pending", "completed", "failed"]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

/** Idempotency key chosen by the client; reuse it verbatim when retrying. */
export const ClientMessageIdSchema = z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/, "1–128 chars of A–Z a–z 0–9 . _ : -");

/** Maximum length of a user message, counted after normalization. Mirrored by a DB CHECK. */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Canonical form of user text, applied before validation, storage and
 * duplicate comparison:
 *  - CRLF/CR → LF
 *  - runs of spaces/tabs/other non-newline whitespace → one space
 *  - no spaces at the start or end of a line
 *  - at most one blank line in a row
 *  - no leading/trailing whitespace overall
 */
export function normalizeMessage(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** Limits for the page text sent with "Ask about this page". */
export const MAX_PAGE_URL_LENGTH = 600;
export const MAX_PAGE_TITLE_LENGTH = 200;
export const MAX_PAGE_TEXT_LENGTH = 6000;

/** Where the chat is shown, e.g. the project page the visitor is on. Used for this reply only, never stored. */
export const MessageContextSchema = z.strictObject({
    /** The project the page is about: its id or its URL slug. */
    projectId: z
        .string()
        .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
        .optional(),
    /** Projects explicitly attached to this prompt from the chat's project cards. */
    projectIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)).max(3).optional(),
    /** The website page the visitor asked about ("Ask about this page"): what it says, read in their browser. */
    pageContent: z
        .strictObject({
            url: z.string().url().max(MAX_PAGE_URL_LENGTH),
            title: z.string().trim().max(MAX_PAGE_TITLE_LENGTH),
            text: z.string().max(MAX_PAGE_TEXT_LENGTH),
        })
        .optional(),
});
export type MessageContext = z.infer<typeof MessageContextSchema>;

export const SendMessageRequestSchema = z.strictObject({
    clientMessageId: ClientMessageIdSchema,
    message: z
        .string()
        .transform(normalizeMessage)
        .pipe(safeText(MAX_MESSAGE_LENGTH)),
    context: MessageContextSchema.optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const ChatMessageSchema = z.object({
    id: UuidSchema,
    conversationId: UuidSchema,
    role: MessageRoleSchema,
    clientMessageId: z.string(),
    status: MessageStatusSchema,
    /** Plain text: user input, or concatenated assistant text blocks. */
    content: z.string(),
    /** Ordered blocks. Always empty for user messages. */
    blocks: z.array(ChatBlockSchema),
    replyToMessageId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema.nullable(),
    error: z.object({ code: ErrorCodeSchema, message: z.string() }).nullable(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ListMessagesQuerySchema = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().min(1).max(200).optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export const MessagePageSchema = z.object({
    data: z.array(ChatMessageSchema),
    pagination: z.object({
        limit: z.number().int(),
        hasMore: z.boolean(),
        /** Pass as `before` to fetch the next-older page; null when exhausted. */
        nextCursor: z.string().nullable(),
    }),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

// ---------------------------------------------------------------- properties

const optionalNumber = (schema: z.ZodNumber) => z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().pipe(schema).optional());

/** `GET /api/v1/properties`: more results for a row of cards, by its `query`. */
export const PropertySearchParamsSchema = z.strictObject({
    keywords: z.string().trim().min(1).max(100).optional(),
    bedrooms: optionalNumber(z.number().int().min(1).max(20)),
    budgetMinInr: optionalNumber(z.number().nonnegative()),
    budgetMaxInr: optionalNumber(z.number().nonnegative()),
    category: z.enum(["Residential", "Commercial"]).optional(),
    nearProjectId: z.string().min(1).max(64).optional(),
    withinKm: optionalNumber(z.number().positive().max(25)),
    page: optionalNumber(z.number().int().min(1).max(50)),
    limit: optionalNumber(z.number().int().min(1).max(12)),
});
export type PropertySearchParams = z.infer<typeof PropertySearchParamsSchema>;

export const PropertyPageSchema = z.object({
    data: z.array(PropertyCardSchema),
    pagination: z.object({
        page: z.number().int(),
        limit: z.number().int(),
        total: z.number().int().nullable(),
        hasMore: z.boolean(),
    }),
});
export type PropertyPage = z.infer<typeof PropertyPageSchema>;

// ---------------------------------------------------------------- leads

/** A callback, enquiry or site-visit request from a form. Never stored by this API. */
export const CreateLeadRequestSchema = z
    .strictObject({
        requestType: z.enum(["callback", "enquiry", "site_visit", "online_presentation"]),
        projectIds: z.array(z.string().min(1).max(64)).max(5).default([]),
        /** Typed when a site visit starts outside a project card. */
        projectName: z.string().trim().min(2).max(160).optional(),
        name: z.string().trim().min(2).max(100),
        /** A 10-digit Indian mobile number, or an international one with its +code. */
        phone: z.string().trim().regex(/^\+?[0-9][0-9 -]{7,18}$/, "Enter a valid mobile number"),
        email: z.email().max(254).optional(),
        message: z.string().trim().max(1000).optional(),
        visitDate: IsoDateSchema.optional(),
        /** 24-hour "HH:MM". */
        visitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        transportMode: z.enum(["cab", "not-required"]).optional(),
        meetingPlatform: z.enum(["google-meet", "teams", "zoom"]).optional(),
    })
    .superRefine((lead, ctx) => {
        const appointment = lead.requestType === "site_visit" || lead.requestType === "online_presentation";
        if (appointment && (!lead.visitDate || !lead.visitTime)) {
            ctx.addIssue({ code: "custom", message: "Choose a preferred date and time", path: ["visitDate"] });
        }
        if (lead.requestType === "site_visit" && !lead.transportMode) {
            ctx.addIssue({ code: "custom", message: "Choose a transport option", path: ["transportMode"] });
        }
        if (lead.requestType === "online_presentation" && !lead.meetingPlatform) {
            ctx.addIssue({ code: "custom", message: "Choose an online presentation platform", path: ["meetingPlatform"] });
        }
    });
export type CreateLeadRequest = z.input<typeof CreateLeadRequestSchema>;

export const LeadSchema = z.object({
    leadId: UuidSchema,
    /** The number the code was sent to, mostly hidden, e.g. "+91 •••••• 3210". */
    phoneMasked: z.string(),
    verified: z.boolean(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const LeadParamsSchema = z.strictObject({ leadId: UuidSchema });
export const VerifyLeadRequestSchema = z.strictObject({ otp: z.string().regex(/^\d{4,8}$/, "Enter the code you received") });
export type VerifyLeadRequest = z.infer<typeof VerifyLeadRequestSchema>;

// ---------------------------------------------------------------- SSE events

export const SSE_EVENT_NAMES = [
    "message.started",
    "text.delta",
    "block",
    "status",
    "message.completed",
    "message.error",
    "suggestions",
] as const;
export type SseEventName = (typeof SSE_EVENT_NAMES)[number];

export const MessageStartedEventSchema = z.object({
    conversationId: UuidSchema,
    clientMessageId: z.string(),
    userMessageId: UuidSchema,
    assistantMessageId: UuidSchema,
    /** True when the stream replays a previously completed response. */
    replay: z.boolean(),
});

export const TextDeltaEventSchema = z.object({
    messageId: UuidSchema,
    /** Position of the `text` block this delta belongs to. */
    index: z.number().int().nonnegative(),
    delta: z.string(),
});

export const BlockEventSchema = z.object({
    messageId: UuidSchema,
    index: z.number().int().nonnegative(),
    block: ChatBlockSchema,
});

/** What the assistant is doing right now (e.g. "Searching projects…"). Transient: never stored. */
export const StatusEventSchema = z.object({
    messageId: UuidSchema,
    label: z.string().max(80),
});

/**
 * Questions the user might ask next, sent after `message.completed` (the
 * stream stays open for them). Transient: never stored, so a reloaded
 * conversation has none.
 */
export const SuggestionsEventSchema = z.object({
    messageId: UuidSchema,
    questions: z.array(z.string().min(1).max(120)).min(1).max(4),
});

export const MessageCompletedEventSchema = z.object({
    message: ChatMessageSchema,
});

export const MessageErrorEventSchema = z.object({
    messageId: UuidSchema.nullable(),
    error: ApiErrorBodySchema,
});

export type MessageStartedEvent = z.infer<typeof MessageStartedEventSchema>;
export type TextDeltaEvent = z.infer<typeof TextDeltaEventSchema>;
export type BlockEvent = z.infer<typeof BlockEventSchema>;
export type StatusEvent = z.infer<typeof StatusEventSchema>;
export type SuggestionsEvent = z.infer<typeof SuggestionsEventSchema>;
export type MessageCompletedEvent = z.infer<typeof MessageCompletedEventSchema>;
export type MessageErrorEvent = z.infer<typeof MessageErrorEventSchema>;

export type SseEvent =
    | { event: "message.started"; data: MessageStartedEvent }
    | { event: "text.delta"; data: TextDeltaEvent }
    | { event: "block"; data: BlockEvent }
    | { event: "status"; data: StatusEvent }
    | { event: "message.completed"; data: MessageCompletedEvent }
    | { event: "message.error"; data: MessageErrorEvent }
    | { event: "suggestions"; data: SuggestionsEvent };
