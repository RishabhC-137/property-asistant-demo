import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    BLOCK_TYPES,
    ChatBlockSchema,
    MAX_MESSAGE_LENGTH,
    normalizeMessage,
    SendMessageRequestSchema,
    StructuredBlockSchema,
    type ChatBlock,
} from "@property-assistant/contracts";
import { FIXTURE_PROPERTIES, LEAD_FORM, SITE_VISIT_FORM } from "@property-assistant/llm";

const cardA = FIXTURE_PROPERTIES[0]!;
const cardB = FIXTURE_PROPERTIES[1]!;

/** One valid example of every block type. */
export const VALID_BLOCKS: Record<ChatBlock["type"], ChatBlock> = {
    text: { type: "text", data: { text: "Hello there." } },
    property_cards: {
        type: "property_cards",
        data: { title: "Results", items: [cardA], totalResults: 1, notice: null, criteria: null, query: null },
    },
    property_gallery: {
        type: "property_gallery",
        data: {
            projectId: cardA.id,
            projectName: cardA.name,
            images: [{ url: "https://example.com/a/front.webp", path: "front.webp", alt: "Front", category: "exterior" }],
            detailUrl: null,
        },
    },
    project_map: {
        type: "project_map",
        data: { projectId: cardA.id, projectName: cardA.name, coordinates: { lat: 28.4595, lng: 77.0266 }, address: null },
    },
    project_details: {
        type: "project_details",
        data: {
            project: cardA,
            bookingAmountInr: 2_100_000,
            nearby: [{ kind: "Metro", name: "Sector 55-56", distance: "2.1 km", travelTime: "6 min" }],
            loanBanks: ["HDFC Bank", "SBI"],
            locationAdvantages: ["Close to Golf Course Extension Road"],
        },
    },
    payment_plan: {
        type: "payment_plan",
        data: {
            projectId: cardA.id,
            projectName: cardA.name,
            bookingAmountInr: 2_100_000,
            stages: [
                { stage: "At booking", percentage: 10, note: null },
                { stage: "On possession", percentage: 90, note: "Of the total sale value" },
            ],
            notice: null,
        },
    },
    property_comparison: {
        type: "property_comparison",
        data: { title: "Compare", items: [cardA, cardB], attributes: ["price", "status"], notice: "Verify details." },
    },
    clarification: {
        type: "clarification",
        data: {
            questions: [{ id: "budget", text: "What is your budget?", criterion: "budget", options: [] }],
            missingCriteria: ["budget"],
        },
    },
    quick_replies: {
        type: "quick_replies",
        data: { prompt: null, options: [{ id: "a", label: "A", value: "Option A" }] },
    },
    lead_capture_form: LEAD_FORM,
    site_visit_form: SITE_VISIT_FORM,
};

const clone = <T>(value: T): T => structuredClone(value);

describe("block schemas", () => {
    it("has an example for every registered block type", () => {
        assert.deepEqual(Object.keys(VALID_BLOCKS).sort(), [...BLOCK_TYPES].sort());
    });

    for (const [type, block] of Object.entries(VALID_BLOCKS)) {
        it(`accepts a valid ${type} block`, () => {
            const parsed = ChatBlockSchema.parse(block);
            assert.equal(parsed.type, type);
            assert.deepEqual(parsed, block);
        });
    }

    it("only accepts gallery images with an HTTPS URL", () => {
        const gallery = clone(VALID_BLOCKS.property_gallery) as Extract<ChatBlock, { type: "property_gallery" }>;
        gallery.data.images[0]!.url = "http://example.com/a/front.webp";
        assert.equal(ChatBlockSchema.safeParse(gallery).success, false);
    });

    it("rejects unknown block types and missing data", () => {
        assert.equal(ChatBlockSchema.safeParse({ type: "carousel", data: {} }).success, false);
        assert.equal(ChatBlockSchema.safeParse({ type: "text" }).success, false);
        assert.equal(ChatBlockSchema.safeParse({ type: "text", data: { text: "" } }).success, false);
    });

    it("excludes text from structured blocks (text streams via text.delta)", () => {
        assert.equal(StructuredBlockSchema.safeParse(VALID_BLOCKS.text).success, false);
        assert.equal(StructuredBlockSchema.safeParse(VALID_BLOCKS.quick_replies).success, true);
    });

    it("strips unknown fields from block data", () => {
        const block = clone(VALID_BLOCKS.quick_replies) as ChatBlock & { data: Record<string, unknown> };
        block.data.internalNote = "secret";
        const parsed = ChatBlockSchema.parse(block);
        assert.equal("internalNote" in parsed.data, false);
    });

    it("property_cards: requires items, unique ids and https URLs", () => {
        const empty = clone(VALID_BLOCKS.property_cards) as Extract<ChatBlock, { type: "property_cards" }>;
        empty.data.items = [];
        assert.equal(ChatBlockSchema.safeParse(empty).success, false);

        const dup = clone(VALID_BLOCKS.property_cards) as Extract<ChatBlock, { type: "property_cards" }>;
        dup.data.items = [cardA, cardA];
        assert.equal(ChatBlockSchema.safeParse(dup).success, false);

        const insecure = clone(VALID_BLOCKS.property_cards) as Extract<ChatBlock, { type: "property_cards" }>;
        insecure.data.items[0]!.detailUrl = "http://example.com/p";
        assert.equal(ChatBlockSchema.safeParse(insecure).success, false);

        const script = clone(VALID_BLOCKS.property_cards) as Extract<ChatBlock, { type: "property_cards" }>;
        script.data.items[0]!.image = { url: "javascript:alert(1)", path: "x.webp", alt: "x" };
        assert.equal(ChatBlockSchema.safeParse(script).success, false);
    });

    it("property_cards: criteria is optional for older blocks and validated when present", () => {
        const { criteria: _omitted, ...legacyData } = VALID_BLOCKS.property_cards.data as { criteria: unknown };
        const legacy = ChatBlockSchema.parse({ type: "property_cards", data: legacyData });
        assert.equal(legacy.type === "property_cards" && legacy.data.criteria, null);

        const searched = clone(VALID_BLOCKS.property_cards) as Extract<ChatBlock, { type: "property_cards" }>;
        searched.data.criteria = { bedrooms: 3, budgetMinInr: null, budgetMaxInr: 30_000_000 };
        assert.equal(ChatBlockSchema.safeParse(searched).success, true);
        searched.data.criteria = { bedrooms: -1, budgetMinInr: null, budgetMaxInr: null };
        assert.equal(ChatBlockSchema.safeParse(searched).success, false);
    });

    it("property_comparison: needs 2–4 distinct projects and known attributes", () => {
        const one = clone(VALID_BLOCKS.property_comparison) as Extract<ChatBlock, { type: "property_comparison" }>;
        one.data.items = [cardA];
        assert.equal(ChatBlockSchema.safeParse(one).success, false);

        const badAttr = clone(VALID_BLOCKS.property_comparison) as { data: { attributes: string[] } };
        badAttr.data.attributes = ["price", "secret_margin"];
        assert.equal(ChatBlockSchema.safeParse(badAttr).success, false);
    });

    it("clarification: rejects unknown criteria and duplicate questions", () => {
        const bad = clone(VALID_BLOCKS.clarification) as { data: { missingCriteria: string[] } };
        bad.data.missingCriteria = ["favourite_colour"];
        assert.equal(ChatBlockSchema.safeParse(bad).success, false);

        const dup = clone(VALID_BLOCKS.clarification) as Extract<ChatBlock, { type: "clarification" }>;
        dup.data.questions.push(dup.data.questions[0]!);
        assert.equal(ChatBlockSchema.safeParse(dup).success, false);
    });

    it("quick_replies: 1–8 options with unique ids", () => {
        const none = clone(VALID_BLOCKS.quick_replies) as Extract<ChatBlock, { type: "quick_replies" }>;
        none.data.options = [];
        assert.equal(ChatBlockSchema.safeParse(none).success, false);

        const many = clone(VALID_BLOCKS.quick_replies) as Extract<ChatBlock, { type: "quick_replies" }>;
        many.data.options = Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, label: `O${i}`, value: `v${i}` }));
        assert.equal(ChatBlockSchema.safeParse(many).success, false);
    });

    it("forms: definitions only, with valid fields", () => {
        for (const form of [LEAD_FORM, SITE_VISIT_FORM]) {
            assert.equal(form.data.submission.mode, "disabled");
        }
        const enabled = clone(LEAD_FORM) as { data: { submission: { mode: string } } };
        enabled.data.submission.mode = "api";
        assert.equal(ChatBlockSchema.safeParse(enabled).success, false);

        const selectNoOptions = clone(LEAD_FORM);
        selectNoOptions.data.fields[0] = { ...selectNoOptions.data.fields[0]!, input: "select", options: null };
        assert.equal(ChatBlockSchema.safeParse(selectNoOptions).success, false);

        const dupField = clone(SITE_VISIT_FORM);
        dupField.data.fields.push(dupField.data.fields[0]!);
        assert.equal(ChatBlockSchema.safeParse(dupField).success, false);

        const badName = clone(LEAD_FORM);
        badName.data.fields[0] = { ...badName.data.fields[0]!, name: "full name" };
        assert.equal(ChatBlockSchema.safeParse(badName).success, false);
    });

    it("rejects NUL characters that PostgreSQL cannot store", () => {
        assert.equal(ChatBlockSchema.safeParse({ type: "text", data: { text: "a\u0000b" } }).success, false);
    });
});

describe("send message request", () => {
    it("trims and validates the message and idempotency key", () => {
        const ok = SendMessageRequestSchema.parse({ clientMessageId: "msg-1", message: "  hi  " });
        assert.equal(ok.message, "hi");
        const page = { url: "https://example.com/about", title: "About us", text: "We are in Sector 49." };
        assert.deepEqual(SendMessageRequestSchema.parse({ clientMessageId: "msg-1", message: "hi", context: { pageContent: page } }).context, { pageContent: page });
        for (const bad of [
            { clientMessageId: "msg-1", message: "   " },
            { clientMessageId: "msg-1", message: "x".repeat(4001) },
            { clientMessageId: "has space", message: "hi" },
            { clientMessageId: "", message: "hi" },
            { clientMessageId: "x".repeat(129), message: "hi" },
            { clientMessageId: "msg-1", message: "hi", extra: true },
            { clientMessageId: "msg-1", message: "hi", context: { pageContent: { url: "not a url", title: "", text: "x" } } },
            { clientMessageId: "msg-1", message: "hi", context: { pageContent: { url: "https://a.com", title: "", text: "x".repeat(6001) } } },
            { message: "hi" },
        ]) {
            assert.equal(SendMessageRequestSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
        }
    });

    it("removes leading, trailing and repeated whitespace but keeps line breaks", () => {
        const cases: Array<[string, string]> = [
            ["  hi  ", "hi"],
            ["3   BHK    flats", "3 BHK flats"],
            ["tabs\t\tand\u00a0nbsp", "tabs and nbsp"],
            ["line one   \n   line two", "line one\nline two"],
            ["para one\n\n\n\n\npara two", "para one\n\npara two"],
            ["windows\r\nline", "windows\nline"],
            ["\n\n  padded  \n\n", "padded"],
        ];
        for (const [input, expected] of cases) {
            assert.equal(normalizeMessage(input), expected, JSON.stringify(input));
            assert.equal(SendMessageRequestSchema.parse({ clientMessageId: "m", message: input }).message, expected);
        }
    });

    it("limits length after normalization", () => {
        const max = "x".repeat(MAX_MESSAGE_LENGTH);
        assert.equal(SendMessageRequestSchema.safeParse({ clientMessageId: "m", message: max }).success, true);
        assert.equal(SendMessageRequestSchema.safeParse({ clientMessageId: "m", message: `${max}y` }).success, false);
        // Extra spaces don't count towards the limit: they are removed first.
        const padded = `   ${"x".repeat(MAX_MESSAGE_LENGTH - 2)}      y   `;
        const parsed = SendMessageRequestSchema.parse({ clientMessageId: "m", message: padded });
        assert.equal(parsed.message.length, MAX_MESSAGE_LENGTH);
    });
});
