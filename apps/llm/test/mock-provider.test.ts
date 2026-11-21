import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StructuredBlockSchema } from "@property-assistant/contracts";
import { SYSTEM_PROMPT } from "../src/gemini.provider.js";
import { FIXTURE_PROPERTIES } from "../src/fixtures.js";
import { MockChatProvider, respond } from "../src/mock.provider.js";
import type { ProviderEvent } from "../src/types.js";

async function collect(message: string): Promise<ProviderEvent[]> {
    const events: ProviderEvent[] = [];
    for await (const e of new MockChatProvider().generate({ conversationId: "c", message, history: [] })) events.push(e);
    return events;
}

const blockTypes = (message: string) => respond(message).blocks.map((b) => b.type);

describe("mock provider", () => {
    it("uses a 50-project fictional catalogue across residential and commercial property types", () => {
        assert.equal(FIXTURE_PROPERTIES.length, 50);
        assert.equal(new Set(FIXTURE_PROPERTIES.map((project) => project.id)).size, 50);
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.configurations.some((configuration) => configuration.label === "Studio")));
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.propertyTypes.includes("Villa")));
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.propertyTypes.includes("Office")));
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.propertyTypes.includes("Retail")));
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.propertyTypes.includes("Plot")));
        assert.ok(FIXTURE_PROPERTIES.some((project) => project.propertyTypes.includes("Warehouse")));
    });

    it("is deterministic", async () => {
        assert.deepEqual(await collect("Show me 3 BHK flats"), await collect("Show me 3 BHK flats"));
    });

    it("streams text before blocks, and every block is schema-valid", async () => {
        for (const message of [
            "hi",
            "compare",
            "3 bhk under 4 crore",
            "3 bhk",
            "site visit",
            "call me",
            "photos of Aster Vale",
            "Tell me about Morrow Grove",
            "payment plan for Cedar Courtyards",
            "Where is Meridian Workyards?",
            "???",
        ]) {
            const events = await collect(message);
            const firstBlock = events.findIndex((e) => e.kind === "block");
            assert.ok(events.slice(0, firstBlock).every((e) => e.kind === "text"));
            for (const e of events) if (e.kind === "block") StructuredBlockSchema.parse(e.block);
        }
    });

    it("routes intents to the expected block types", () => {
        assert.deepEqual(blockTypes("Show me 3 BHK flats in Gurugram"), ["clarification"], "answer options live in the question panel");
        assert.deepEqual(blockTypes("3 BHK under 4 crore"), ["property_cards", "quick_replies"]);
        assert.deepEqual(blockTypes("Compare these projects"), ["property_comparison"]);
        assert.deepEqual(blockTypes("Tell me about Aster Vale"), ["project_details"]);
        assert.deepEqual(blockTypes("Show photos of Morrow Grove"), ["property_gallery"]);
        assert.deepEqual(blockTypes("Payment plan for Cedar Courtyards"), ["payment_plan"]);
        assert.deepEqual(blockTypes("Where is Meridian Workyards?"), ["project_map"]);
        assert.deepEqual(blockTypes("I want a site visit"), ["site_visit_form"]);
        assert.deepEqual(blockTypes("Please call me back"), ["lead_capture_form"]);
        assert.deepEqual(blockTypes("hello"), ["quick_replies"]);
        assert.deepEqual(blockTypes("Show commercial offices"), ["clarification"]);
    });

    it("does not ask office buyers for bedrooms and keeps results to workspaces", () => {
        const office = respond("I'm looking to buy an office space on New Metro, budget ₹1.5–3 Cr.");
        const cards = office.blocks.find((block) => block.type === "property_cards");

        assert.match(office.text, /don't have a sample workspace listed in New Metro/i);
        assert.doesNotMatch(office.text, /\bbedrooms?\b|\bBHK\b/i);
        assert.equal(cards, undefined);
        assert.deepEqual(office.blocks.at(-1)?.type, "quick_replies");

        const missingBudget = respond("Show commercial offices").blocks[0];
        assert.equal(missingBudget?.type, "clarification");
        if (missingBudget?.type === "clarification") assert.deepEqual(missingBudget.data.missingCriteria, ["budget"]);
    });

    it("answers questions about the company, its founder and its office from the company facts", () => {
        const office = respond("Where is your office?");
        assert.match(office.text, /Sector 65, Gurugram/);
        assert.match(office.text, /hello@propertydesk\.example/);
        assert.deepEqual(office.blocks, []);
        assert.doesNotMatch(office.text, /\*\*Phone:\*\*/);
        const founder = respond("Who is the founder of Property Desk?");
        assert.match(founder.text, /don't have the founder's details/);
        assert.match(founder.text, /callback request/);
    });

    it("reads back the page the visitor asked about", async () => {
        const events: ProviderEvent[] = [];
        const page = { pageContent: { url: "https://example.com/about", title: "About Property Desk", text: "Founded to help buyers in Metro City." } };
        for await (const e of new MockChatProvider().generate({ conversationId: "c", message: "what's this page?", history: [], page })) events.push(e);
        const text = events.map((e) => (e.kind === "text" ? e.delta : "")).join("");
        assert.match(text, /About Property Desk/);
        assert.match(text, /Founded to help buyers/);
    });

    it("puts the company facts in the system prompt", () => {
        assert.match(SYSTEM_PROMPT, /About Property Desk/);
        assert.match(SYSTEM_PROMPT, /Sector 65, Gurugram/);
        assert.match(SYSTEM_PROMPT, /Do not guess a name/);
        assert.match(SYSTEM_PROMPT, /never ask for bedrooms or BHK/);
    });

    it("asks only for criteria that are missing", () => {
        const block = respond("flats under 3 crore").blocks[0];
        assert.equal(block?.type, "clarification");
        if (block?.type === "clarification") assert.deepEqual(block.data.missingCriteria, ["bedrooms"]);
    });

    it("finds studios on Golf Course Extension Road within a rupee-denominated range", () => {
        const result = respond("I'm looking to buy a studio apartment on Golf Course Ext. Road, budget ₹1.5–3 Cr.");
        const cards = result.blocks.find((block) => block.type === "property_cards");

        assert.equal(cards?.type, "property_cards");
        assert.doesNotMatch(result.text, /bedrooms|BHK|budget range/i);
        if (cards?.type === "property_cards") {
            assert.deepEqual(cards.data.items.map((project) => project.name), ["Olive Quarter", "Luma Residences", "Fernlight"]);
            assert.ok(cards.data.items.every((project) => project.source === "fixture"));
        }
    });

    it("carries the original brief across clarification replies without repeating questions", () => {
        const request = "I'm looking for 2 BHK apartments";
        const clarification = respond(request);
        assert.equal(clarification.blocks[0]?.type, "clarification");
        const answer = respond("₹2–4 Cr", [
            { role: "user", content: request },
            { role: "assistant", content: clarification.text, blocks: clarification.blocks },
        ]);

        assert.ok(answer.blocks.some((block) => block.type === "property_cards"));
        assert.ok(answer.blocks.every((block) => block.type !== "clarification"));
        const cards = answer.blocks.find((block) => block.type === "property_cards");
        if (cards?.type === "property_cards") {
            assert.ok(cards.data.items.length > 0);
            assert.ok(cards.data.items.every((project) => project.configurations.some((configuration) => configuration.bedrooms === 2)));
        }
    });

    it("only ever returns labelled fixture properties", () => {
        for (const message of [
            "3 bhk under 4 crore",
            "compare",
            "Tell me about Aster Vale",
            "Show photos of Morrow Grove",
            "Payment plan for Cedar Courtyards",
            "Where is Meridian Workyards?",
        ]) {
            for (const block of respond(message).blocks) {
                if (block.type === "property_cards" || block.type === "property_comparison") {
                    assert.ok(block.data.notice?.includes("not real listings"));
                    for (const item of block.data.items) assert.equal(item.source, "fixture");
                } else if (block.type === "project_details") {
                    assert.equal(block.data.project.source, "fixture");
                    assert.equal(block.data.project.reraId, null);
                } else if (block.type === "property_gallery") {
                    assert.ok(block.data.images.length > 0);
                    assert.ok(block.data.images.every((image) => image.url.startsWith("https://")));
                } else if (block.type === "payment_plan") {
                    assert.ok(block.data.notice?.includes("not real listings"));
                } else if (block.type === "project_map") {
                    assert.match(block.data.projectId, /^fixture-/);
                }
            }
        }
    });

    it("returns projects that match the search and keeps every project available for site visits", () => {
        const result = respond("3 bhk under 4 crore").blocks[0];
        assert.equal(result?.type, "property_cards");
        if (result?.type !== "property_cards") return;
        assert.ok(result.data.items.length >= 3);
        assert.ok(result.data.items.every((item) => item.category === "Residential"));
        assert.ok(result.data.items.every((item) => item.photos.length >= 3 && item.image?.url));

        const visit = respond("I want a site visit").blocks[0];
        assert.equal(visit?.type, "site_visit_form");
        if (visit?.type === "site_visit_form") {
            const projectChoices = visit.data.fields.find((field) => field.name === "projectId");
            assert.equal(projectChoices?.options?.length, 50);
            assert.ok(projectChoices?.options?.every((option) => option.image));
        }
    });
});
