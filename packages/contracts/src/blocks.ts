import { z } from "zod";
import { IsoDateSchema, safeText } from "./common.js";
import { CoordinatesSchema, GalleryImageSchema, PropertyCardSchema } from "./property.js";

/**
 * Typed response blocks. Every block is `{ type, data }` with a stable `type`
 * discriminator. Contracts describe data only — rendering is the client's job.
 *
 * Adding a new block type requires: a schema here, an entry in
 * `BLOCK_TYPES`, and a migration extending the `message_blocks.type` CHECK.
 */

const uniqueBy =
    <T>(key: (item: T) => string, what: string) =>
    (items: T[], ctx: z.RefinementCtx) => {
        const seen = new Set<string>();
        for (const item of items) {
            const k = key(item);
            if (seen.has(k)) {
                ctx.addIssue({ code: "custom", message: `Duplicate ${what}: ${k}` });
                return;
            }
            seen.add(k);
        }
    };

// ---------------------------------------------------------------- text

export const TextBlockSchema = z.object({
    type: z.literal("text"),
    data: z.object({
        text: safeText(20_000),
    }),
});

// ---------------------------------------------------------------- property_cards

/** The search filters behind a list of cards, so clients can show the price that matched. */
export const CardSearchCriteriaSchema = z.object({
    bedrooms: z.number().positive().max(20).nullable(),
    budgetMinInr: z.number().nonnegative().nullable(),
    budgetMaxInr: z.number().nonnegative().nullable(),
});
export type CardSearchCriteria = z.infer<typeof CardSearchCriteriaSchema>;

/**
 * The full search behind a row of cards, so a client can load more of the
 * same results (`GET /api/v1/properties`) without asking the model again.
 */
export const CardQuerySchema = z.object({
    keywords: safeText(100).nullable(),
    bedrooms: z.number().int().min(1).max(20).nullable(),
    budgetMinInr: z.number().nonnegative().nullable(),
    budgetMaxInr: z.number().nonnegative().nullable(),
    category: z.enum(["Residential", "Commercial"]).nullable(),
    /** Projects near this one, within `withinKm`. */
    nearProjectId: safeText(64).nullable(),
    withinKm: z.number().positive().max(25).nullable(),
});
export type CardQuery = z.infer<typeof CardQuerySchema>;

export const PropertyCardsBlockSchema = z.object({
    type: z.literal("property_cards"),
    data: z.object({
        title: safeText(200),
        items: z
            .array(PropertyCardSchema)
            .min(1)
            .max(12)
            .superRefine(uniqueBy((card) => card.id, "property id")),
        /** Total matches known to the source, if reported. */
        totalResults: z.number().int().nonnegative().nullable(),
        /** Caveat shown with the results (e.g. demo data, verify prices). */
        notice: safeText(500).nullable(),
        /** Null when the cards are not from a filtered search. Blocks stored before this field existed omit it. */
        criteria: CardSearchCriteriaSchema.nullable().default(null),
        /** The search behind the cards; null for hand-picked cards. Older blocks omit it. */
        query: CardQuerySchema.nullable().default(null),
    }),
});

// ---------------------------------------------------------------- property_gallery

export const PropertyGalleryBlockSchema = z.object({
    type: z.literal("property_gallery"),
    data: z.object({
        projectId: safeText(64),
        projectName: safeText(200),
        images: z
            .array(GalleryImageSchema)
            .min(1)
            .max(40)
            .superRefine(uniqueBy((image) => image.url, "image url")),
        /** The project's page on the source site, if known. */
        detailUrl: z.url({ protocol: /^https$/ }).nullable(),
    }),
});

// ---------------------------------------------------------------- project_map

/**
 * Where a project is. Clients show it on a map and may offer the distance
 * from the viewer, computed on the device: the viewer's location is never sent.
 */
export const ProjectMapBlockSchema = z.object({
    type: z.literal("project_map"),
    data: z.object({
        projectId: safeText(64),
        projectName: safeText(200),
        coordinates: CoordinatesSchema,
        /** Locality or city line, if known. */
        address: safeText(200).nullable(),
    }),
});

// ---------------------------------------------------------------- project_details

/**
 * One project in depth, for "tell me about X": the card plus the facts a buyer
 * weighs next (booking amount, nearby places, approved banks, advantages).
 */
export const ProjectDetailsBlockSchema = z.object({
    type: z.literal("project_details"),
    data: z.object({
        project: PropertyCardSchema,
        bookingAmountInr: z.number().nonnegative().nullable(),
        /** Closest first, as the source lists them. */
        nearby: z
            .array(
                z.object({
                    kind: safeText(60),
                    name: safeText(160),
                    distance: safeText(40).nullable(),
                    travelTime: safeText(40).nullable(),
                }),
            )
            .max(8),
        loanBanks: z.array(safeText(80)).max(12),
        locationAdvantages: z.array(safeText(200)).max(6),
    }),
});

// ---------------------------------------------------------------- payment_plan

export const PaymentPlanBlockSchema = z.object({
    type: z.literal("payment_plan"),
    data: z.object({
        projectId: safeText(64),
        projectName: safeText(200),
        bookingAmountInr: z.number().nonnegative().nullable(),
        /** Stages exactly as the source lists them, in order. */
        stages: z
            .array(
                z.object({
                    stage: safeText(200),
                    percentage: z.number().min(0).max(100),
                    note: safeText(200).nullable(),
                }),
            )
            .min(1)
            .max(20),
        notice: safeText(500).nullable(),
    }),
});

// ---------------------------------------------------------------- property_comparison

export const ComparisonAttributeSchema = z.enum([
    "price",
    "price_per_sqft",
    "configurations",
    "possession_date",
    "status",
    "developer",
    "locality",
    "rera_id",
]);
export type ComparisonAttribute = z.infer<typeof ComparisonAttributeSchema>;

export const PropertyComparisonBlockSchema = z.object({
    type: z.literal("property_comparison"),
    data: z.object({
        title: safeText(200),
        items: z
            .array(PropertyCardSchema)
            .min(2)
            .max(4)
            .superRefine(uniqueBy((card) => card.id, "property id")),
        /** Which attributes to show as comparison rows, in order. */
        attributes: z
            .array(ComparisonAttributeSchema)
            .min(1)
            .superRefine(uniqueBy((a) => a, "attribute")),
        notice: safeText(500).nullable(),
    }),
});

// ---------------------------------------------------------------- clarification

export const SearchCriterionSchema = z.enum([
    "budget",
    "bedrooms",
    "locality",
    "property_type",
    "possession",
    "project",
]);
export type SearchCriterion = z.infer<typeof SearchCriterionSchema>;

export const ClarificationBlockSchema = z.object({
    type: z.literal("clarification"),
    data: z.object({
        questions: z
            .array(
                z.object({
                    id: safeText(64),
                    text: safeText(300),
                    criterion: SearchCriterionSchema.nullable(),
                    /** Answers to pick from; the user may also type their own. Older blocks omit it. */
                    options: z.array(safeText(80)).max(6).default([]),
                }),
            )
            .min(1)
            .max(5)
            .superRefine(uniqueBy((q) => q.id, "question id")),
        missingCriteria: z
            .array(SearchCriterionSchema)
            .superRefine(uniqueBy((c) => c, "criterion")),
    }),
});

// ---------------------------------------------------------------- quick_replies

export const QuickReplySchema = z.object({
    id: safeText(64),
    label: safeText(80),
    /** Text the client sends as the next user message when selected. */
    value: safeText(500),
});
export type QuickReply = z.infer<typeof QuickReplySchema>;

export const QuickRepliesBlockSchema = z.object({
    type: z.literal("quick_replies"),
    data: z.object({
        prompt: safeText(200).nullable(),
        options: z
            .array(QuickReplySchema)
            .min(1)
            .max(8)
            .superRefine(uniqueBy((o) => o.id, "option id")),
    }),
});

// ---------------------------------------------------------------- forms

export const FormFieldSchema = z
    .object({
        name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
        label: safeText(120),
        input: z.enum(["text", "tel", "email", "textarea", "select", "date", "time", "checkbox"]),
        required: z.boolean(),
        placeholder: safeText(120).nullable(),
        maxLength: z.number().int().positive().max(5000).nullable(),
        options: z
            .array(
                z.object({
                    value: safeText(100),
                    label: safeText(120),
                    /** Optional presentation data for rich choices such as the project picker. */
                    image: z.url({ protocol: /^https$/ }).nullable().optional(),
                    detail: safeText(160).nullable().optional(),
                    recommended: z.boolean().optional(),
                }),
            )
            .max(100)
            .nullable(),
        visibleWhen: z
            .object({ field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), equals: safeText(100) })
            .nullable()
            .optional(),
    })
    .superRefine((field, ctx) => {
        if (field.input === "select" && (!field.options || field.options.length === 0)) {
            ctx.addIssue({ code: "custom", message: "select fields need options", path: ["options"] });
        }
        if (field.input !== "select" && field.options !== null) {
            ctx.addIssue({ code: "custom", message: "only select fields take options", path: ["options"] });
        }
    });
export type FormField = z.infer<typeof FormFieldSchema>;

/**
 * How a form is sent. `disabled`: details are collected but sent nowhere.
 * `api`: sent to `POST /api/v1/leads`, then confirmed with a code sent to the
 * phone (`phone_otp`). Contact details never go into the chat.
 */
export const FormSubmissionSchema = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("disabled"), notice: safeText(300) }),
    z.object({ mode: z.literal("api"), verification: z.enum(["phone_otp"]) }),
]);
export type FormSubmission = z.infer<typeof FormSubmissionSchema>;

const formData = {
    formId: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    title: safeText(200),
    description: safeText(500).nullable(),
    fields: z
        .array(FormFieldSchema)
        .min(1)
        .max(20)
        .superRefine(uniqueBy((f) => f.name, "field name")),
    submitLabel: safeText(60),
    consentText: safeText(1000).nullable(),
    submission: FormSubmissionSchema,
};

export const LeadCaptureFormBlockSchema = z.object({
    type: z.literal("lead_capture_form"),
    data: z.object({
        ...formData,
        /** Source project id the enquiry relates to, if any. */
        projectId: safeText(64).nullable(),
        requestType: z.enum(["callback", "enquiry"]),
    }),
});

export const SiteVisitFormBlockSchema = z.object({
    type: z.literal("site_visit_form"),
    data: z.object({
        ...formData,
        /** Source project ids the visit request would cover. */
        projectIds: z.array(safeText(64)).max(5),
        earliestDate: IsoDateSchema.nullable(),
    }),
});

// ---------------------------------------------------------------- unions

export const StructuredBlockSchema = z.discriminatedUnion("type", [
    PropertyCardsBlockSchema,
    PropertyGalleryBlockSchema,
    ProjectMapBlockSchema,
    ProjectDetailsBlockSchema,
    PaymentPlanBlockSchema,
    PropertyComparisonBlockSchema,
    ClarificationBlockSchema,
    QuickRepliesBlockSchema,
    LeadCaptureFormBlockSchema,
    SiteVisitFormBlockSchema,
]);

export const ChatBlockSchema = z.discriminatedUnion("type", [
    TextBlockSchema,
    PropertyCardsBlockSchema,
    PropertyGalleryBlockSchema,
    ProjectMapBlockSchema,
    ProjectDetailsBlockSchema,
    PaymentPlanBlockSchema,
    PropertyComparisonBlockSchema,
    ClarificationBlockSchema,
    QuickRepliesBlockSchema,
    LeadCaptureFormBlockSchema,
    SiteVisitFormBlockSchema,
]);

export const BLOCK_TYPES = [
    "text",
    "property_cards",
    "property_gallery",
    "project_map",
    "project_details",
    "payment_plan",
    "property_comparison",
    "clarification",
    "quick_replies",
    "lead_capture_form",
    "site_visit_form",
] as const;

export type ChatBlock = z.infer<typeof ChatBlockSchema>;
export type StructuredBlock = z.infer<typeof StructuredBlockSchema>;
export type BlockType = ChatBlock["type"];
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type PropertyCardsBlock = z.infer<typeof PropertyCardsBlockSchema>;
export type PropertyGalleryBlock = z.infer<typeof PropertyGalleryBlockSchema>;
export type PaymentPlanBlock = z.infer<typeof PaymentPlanBlockSchema>;
export type ProjectMapBlock = z.infer<typeof ProjectMapBlockSchema>;
export type ProjectDetailsBlock = z.infer<typeof ProjectDetailsBlockSchema>;
export type PropertyComparisonBlock = z.infer<typeof PropertyComparisonBlockSchema>;
export type ClarificationBlock = z.infer<typeof ClarificationBlockSchema>;
export type QuickRepliesBlock = z.infer<typeof QuickRepliesBlockSchema>;
export type LeadCaptureFormBlock = z.infer<typeof LeadCaptureFormBlockSchema>;
export type SiteVisitFormBlock = z.infer<typeof SiteVisitFormBlockSchema>;
export type BlockOf<T extends BlockType> = Extract<ChatBlock, { type: T }>;
