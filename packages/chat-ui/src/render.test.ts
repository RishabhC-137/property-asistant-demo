/**
 * Server-renders real components (no browser needed) to check that every
 * block type renders, and that icon libraries and themes are applied.
 */
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { distanceKm, type ChatBlock, type PropertyCard } from "@property-assistant/contracts";
import * as Lucide from "lucide-react";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatApi } from "./api/client.js";
import { planSlices } from "./blocks/PaymentPlanBlock.js";
import { configSummary } from "./blocks/PropertyCard.js";
import { defaultBlockRenderers } from "./blocks/registry.js";
import type { BlockActions, BlockProps } from "./blocks/types.js";
import { AskPanel, answersMessage, fieldError, knownValues } from "./components/AskPanel.js";
import { ChatWidget } from "./components/ChatWidget.js";
import { Composer } from "./components/Composer.js";
import { parseRichText } from "./lib/richText.js";
import { formatDistance } from "./lib/userLocation.js";
import { MessageList } from "./components/MessageList.js";
import { starterMessage } from "./components/StarterQuestions.js";
import { IconProvider } from "./icons/Icon.js";
import { resolveIcons } from "./icons/resolveIcons.js";
import { ICON_NAMES } from "./icons/types.js";
import { initialChatState, type ChatState, type UiMessage } from "./state/chatReducer.js";

const html = (el: ReactElement) => renderToStaticMarkup(el);

const card: PropertyCard = {
    id: "6aca0be07d2760c3b208e8ba",
    source: "catalog",
    projectCode: "GUR208235",
    slug: "sunrise-park",
    name: "Experion Emerelle Reserve",
    developer: { id: null, name: "Experion Developers", slug: null },
    location: {
        localityName: null,
        localityId: "6aae78fe2c669d04c842ec61",
        city: "Metro",
        pincode: null,
        coordinates: { lat: 28.4189, lng: 76.9553 },
    },
    category: "Residential",
    propertyTypes: ["Apartment"],
    status: "Pre-Launch",
    price: { currency: "INR", min: 35_700_000, max: 51_000_000, pricePerSqft: 17_000 },
    configurations: [
        {
            label: "3 BHK",
            bedrooms: 3,
            size: { min: 2100, max: 2500, unit: "sqft" },
            price: { currency: "INR", min: 35_700_000, max: 42_500_000, pricePerSqft: 17_000 },
            availability: { status: "unknown", availableUnits: null },
        },
    ],
    possessionDate: "2031-08-31",
    reraId: null,
    highlights: ["Three-level clubhouse."],
    amenities: ["Swimming Pool", "Gymnasium", "Tennis Court", "Spa", "Yoga Room"],
    image: { url: null, path: "x.webp", alt: "Exterior" },
    photos: [
        { url: "https://example.com/p/entrance.webp", path: "entrance.webp", alt: "Grand entrance", category: "exterior" },
        { url: "https://example.com/p/pool.webp", path: "pool.webp", alt: "Pool deck", category: "exterior" },
        { url: "https://example.com/p/living.webp", path: "living.webp", alt: "Living room", category: "interior" },
    ],
    detailUrl: "https://example.com/property/sunrise-park",
    dataAsOf: null,
};
const fixture: PropertyCard = { ...card, id: "fixture-1", source: "fixture", name: "Demo Residences A", detailUrl: null };

const field = { placeholder: null, maxLength: null, options: null };
const allBlocks: ChatBlock[] = [
    { type: "text", data: { text: "Here you go <b>not html</b>" } },
    {
        type: "property_cards",
        data: {
            title: "Results",
            items: [card, fixture],
            totalResults: 2,
            notice: "Verify prices.",
            criteria: { bedrooms: 3, budgetMinInr: null, budgetMaxInr: 40_000_000 },
            query: null,
        },
    },
    {
        type: "property_gallery",
        data: {
            projectId: card.id,
            projectName: card.name,
            images: [
                { url: "https://example.com/p/front.webp", path: "front.webp", alt: "Grand entrance", category: "exterior" },
                { url: "https://example.com/p/plan.webp", path: "plan.webp", alt: "Master plan drawing", category: "master_plan" },
            ],
            detailUrl: "https://example.com/project/x",
        },
    },
    {
        type: "project_map",
        data: { projectId: card.id, projectName: card.name, coordinates: { lat: 28.4189, lng: 76.9553 }, address: "Sector 88A, Metro" },
    },
    {
        type: "payment_plan",
        data: {
            projectId: card.id,
            projectName: card.name,
            bookingAmountInr: 2_100_000,
            stages: [
                { stage: "At booking", percentage: 10, note: null },
                { stage: "On possession", percentage: 90, note: "Of the total sale value" },
            ],
            notice: "Indicative plan from the listing.",
        },
    },
    { type: "property_comparison", data: { title: "Compare", items: [card, fixture], attributes: ["price", "possession_date"], notice: null } },
    { type: "clarification", data: { questions: [{ id: "b", text: "What is your budget?", criterion: "budget", options: ["Under ₹1 Cr", "₹1–2 Cr"] }], missingCriteria: ["budget"] } },
    { type: "quick_replies", data: { prompt: "Pick one", options: [{ id: "a", label: "Under ₹2 Cr", value: "under 2 crore" }] } },
    {
        type: "lead_capture_form",
        data: {
            formId: "lead_capture", title: "Request a callback", description: null,
            fields: [{ ...field, name: "name", label: "Full name", input: "text", required: true }],
            submitLabel: "Request callback", consentText: null,
            submission: { mode: "disabled", notice: "Submitting is not available yet." },
            projectId: null, requestType: "callback",
        },
    },
    {
        type: "site_visit_form",
        data: {
            formId: "site_visit", title: "Request a site visit", description: null,
            fields: [
                { ...field, name: "name", label: "Full name", input: "text", required: true },
                { ...field, name: "phone", label: "Mobile number", input: "tel", required: true },
                { ...field, name: "email", label: "Email", input: "email", required: true },
                { ...field, name: "visitDate", label: "Preferred date", input: "date", required: true },
            ],
            submitLabel: "Request visit", consentText: null,
            submission: { mode: "disabled", notice: "Submitting is not available yet." },
            projectIds: [], earliestDate: null,
        },
    },
];

const message = (overrides: Partial<UiMessage>): UiMessage => ({
    key: "a:m1", id: null, role: "assistant", clientMessageId: "m1", content: "", blocks: [],
    status: "completed", error: null, createdAt: "2026-10-19T10:00:00.000Z", replayed: false, live: false, activity: null, stopped: false, suggestions: [], ...overrides,
});

const listState = (messages: UiMessage[]): ChatState => ({ ...initialChatState, phase: "ready", conversationId: "c", messages });

function renderList(messages: UiMessage[], renderers = defaultBlockRenderers, extraActions: Partial<BlockActions> = {}) {
    return html(
        createElement(IconProvider, { value: resolveIcons() },
            createElement(MessageList, {
                state: listState(messages),
                actions: { sendMessage: () => {}, busy: false, ...extraActions },
                renderers, onRetry: () => {}, onLoadOlder: () => {},
                welcomeMessage: "Welcome!", suggestions: ["Try me"],
            }),
        ),
    );
}

const fakeApi: ChatApi = {
    createConversation: () => new Promise(() => {}),
    getConversation: () => new Promise(() => {}),
    listMessages: () => new Promise(() => {}),
    sendMessage: () => new Promise(() => {}),
    stopMessage: () => Promise.resolve({ stopped: true }),
    searchProperties: () => new Promise(() => {}),
    createLead: () => new Promise(() => {}),
    verifyLead: () => new Promise(() => {}),
    resendLeadCode: () => new Promise(() => {}),
};

describe("rendering", () => {
    it("renders every block type", () => {
        const out = renderList([message({ blocks: allBlocks })]);
        for (const expected of [
            "Here you go &lt;b&gt;not html&lt;/b&gt;", // text is escaped, never HTML
            "Experion Emerelle Reserve", "₹3.57 Cr – ₹5.1 Cr", "31 Aug 2031", "Demo data", "Verify prices.",
            "Details", "Swimming Pool", "+2 more", "<table", "Possession", "What is your budget?", "Under ₹2 Cr",
            "Full name", "Preferred date", "Submitting is not available yet.",
            "Location · Experion Emerelle Reserve", "Sector 88A, Metro", "How far is it from you?", "Use my location", "Not now",
            "Your location stays on this device.", "Open in Google Maps",
            "openstreetmap.org/export/embed.html?bbox=76.94330,28.41090,76.96730,28.42690&amp;layer=mapnik&amp;marker=28.4189,76.9553",
            "maps/search/?api=1&amp;query=28.4189,76.9553",
            "Payment plan · Experion Emerelle Reserve", "Booking amount", "₹21 L", "90%", "Of the total sale value", "Indicative plan from the listing.",
            "Photos · Experion Emerelle Reserve", "1 / 2", "Grand entrance", "Master plan 1", "More on the project page",
        ]) {
            assert.ok(out.includes(expected), `missing: ${expected}`);
        }
        assert.match(out, /<button type="submit" class="rec-button rec-button--primary" disabled="">Request callback/);
        assert.doesNotMatch(out, /6aae78fe2c669d04c842ec61/, "opaque locality id never shown");
    });

    it("shows typing, errors with retry, replay markers and the welcome screen", () => {
        assert.match(renderList([message({ status: "streaming" })]), /rec-typing/);
        assert.doesNotMatch(renderList([message({ status: "streaming", stopped: true })]), /rec-typing/, "no dots once stopped");
        assert.match(renderList([message({ status: "streaming", blocks: [], activity: "Searching projects…" })]), /rec-activity__label">Searching projects…/);
        assert.doesNotMatch(
            renderList([message({ status: "streaming", blocks: [], activity: "Searching projects…" })]).split("rec-bubble--assistant")[1]!.split("rec-activity")[0]!,
            /Searching projects/,
            "the label sits under the bubble, not beside the dots",
        );
        const failed = renderList([message({ status: "failed", error: { code: "PROVIDER_ERROR", message: "Could not respond", retryable: true } })]);
        assert.ok(failed.includes("Could not respond") && failed.includes("Retry"));
        assert.ok(renderList([message({ blocks: [allBlocks[0]!], replayed: true })]).includes("replayed"));
        const empty = renderList([]);
        assert.ok(empty.includes("Welcome!") && empty.includes("Try me"));
        assert.ok(empty.includes("What brings you here?"), "first-time visitors get the guided questions");
    });

    it("puts the searched BHK in the main panel, with budget fit, and lists every configuration", () => {
        const twoAndThree: PropertyCard = {
            ...card,
            price: { currency: "INR", min: 18_000_000, max: 62_000_000, pricePerSqft: null },
            configurations: [
                { ...card.configurations[0]!, label: "2 BHK", bedrooms: 2, price: { currency: "INR", min: 18_000_000, max: null, pricePerSqft: null } },
                { ...card.configurations[0]!, label: "3 BHK", bedrooms: 3, price: { currency: "INR", min: 28_000_000, max: null, pricePerSqft: null } },
            ],
        };
        const render = (criteria: unknown) =>
            renderList([
                message({
                    blocks: [
                        { type: "property_cards", data: { title: "R", items: [twoAndThree], totalResults: 1, notice: null, criteria } } as ChatBlock,
                    ],
                }),
            ]);

        const panel = (out: string) => /class="rec-card__primary".*?<\/div><\/div>/.exec(out)?.[0] ?? "";
        const rows = (out: string) => out.slice(out.indexOf(">Configurations<"));

        const searched = render({ bedrooms: 3, budgetMinInr: null, budgetMaxInr: 30_000_000 });
        assert.match(panel(searched), /3 BHK \(Selected\)/);
        assert.match(panel(searched), /From ₹2\.80 Cr/);
        assert.match(panel(searched), /Within budget/);
        // Every configuration in one list, smallest first; the one in the panel is marked as pressed.
        assert.match(rows(searched), /aria-pressed="false" aria-label="Show 2 BHK pricing">.*aria-pressed="true" aria-label="Show 3 BHK pricing">/);
        assert.match(rows(searched), /2 BHK.*From ₹1\.80 Cr/);

        // A budget the searched BHK exceeds is flagged; a cheaper configuration still fits.
        const tight = render({ bedrooms: 3, budgetMinInr: null, budgetMaxInr: 20_000_000 });
        assert.match(panel(tight), /Over budget/);
        assert.match(rows(tight), /Within budget/);

        // No BHK search (and blocks stored before `criteria` existed): the cheapest, not "Selected", no budget tags.
        for (const criteria of [null, undefined]) {
            const out = render(criteria);
            assert.match(panel(out), /rec-card__chip">2 BHK<\/span>/);
            assert.match(panel(out), /From ₹1\.80 Cr/);
            assert.doesNotMatch(out, /Selected|budget/);
        }
    });

    it("puts photos in a swipeable strip, with status and possession as tags", () => {
        const out = renderList([message({ blocks: [{ type: "property_cards", data: { title: "R", items: [card], totalResults: 1, notice: null, criteria: null, query: null } }] })]);
        assert.match(out, /<div class="rec-card__photos" aria-label="Photos of Experion Emerelle Reserve">/);
        assert.equal(out.match(/<img src="https:\/\/example.com\/p\//g)?.length, 3);
        assert.match(out, /alt="Grand entrance" loading="eager"/);
        assert.match(out, /alt="Living room" loading="lazy"/);
        assert.equal(out.match(/<span( class="is-active")?><\/span>/g)?.length, 3, "one dot per photo");
        assert.match(out, /aria-label="Next photo"/);
        assert.match(out, /<span class="rec-badge rec-badge--launch">Pre-Launch<\/span>/);
        assert.match(out, /rec-badge--date rec-card__possession">.*Possession Aug 2031<\/span>/, "possession is a pill on the photo");
        assert.doesNotMatch(out, /Possession: /, "possession moved from the facts list to a tag");

        const ready = renderList([message({ blocks: [{ type: "property_cards", data: { title: "R", items: [{ ...card, status: "Ready to Move", photos: [] }], totalResults: 1, notice: null, criteria: null, query: null } }] })]);
        assert.match(ready, /rec-badge--ready">Ready to Move/);
        assert.match(ready, /rec-card__placeholder/, "no photos and no cover URL: the placeholder");
        assert.doesNotMatch(ready, /Next photo/);
    });

    it("shows a fact grid, and Details beside an Enquire that asks for a callback", () => {
        const out = renderList([message({ blocks: [{ type: "property_cards", data: { title: "R", items: [card], totalResults: 1, notice: null, criteria: null, query: null } }] })]);
        assert.match(out, /<dt>Configurations<\/dt><dd title="3 BHK">3 BHK<\/dd>/);
        assert.match(out, /<dt>Size<\/dt><dd[^>]*>2,100 – 2,500 sq\. ft\.<\/dd>/);
        assert.match(out, /<dt>Price per sq ft<\/dt><dd[^>]*>₹17,000<\/dd>/);
        assert.match(out, /<dt>Type<\/dt><dd[^>]*>Apartment<\/dd>/);
        assert.match(out, /class="rec-card__details"[^>]*>Details<\/a><button type="button" class="rec-card__enquire">.*Enquire<\/button>/);
        assert.match(out, /rec-card__share--labelled.*<span>Share<\/span>/);

        assert.equal(configSummary([
            { ...card.configurations[0]!, label: "4 BHK", bedrooms: 4 },
            { ...card.configurations[0]!, label: "2 BHK", bedrooms: 2 },
            { ...card.configurations[0]!, label: "3 BHK", bedrooms: 3 },
        ]), "2, 3, 4 BHK");
        assert.equal(configSummary([{ ...card.configurations[0]!, label: "Plot", bedrooms: null }]), "Plot");
        assert.equal(configSummary([]), null);
    });

    it("shows one project in depth: identity, the numbers, configurations, nearby and actions", () => {
        const details: ChatBlock = {
            type: "project_details",
            data: {
                project: { ...card, reraId: "RERA-1" },
                bookingAmountInr: 2_100_000,
                nearby: [
                    { kind: "Metro", name: "Sector 55-56 Metro", distance: "2.1 km", travelTime: null },
                    { kind: "Airport", name: "IGI Airport", distance: "18 km", travelTime: null },
                    { kind: "School", name: "DPS", distance: "3 km", travelTime: null },
                    { kind: "Hospital", name: "Medanta", distance: "6 km", travelTime: null },
                ],
                loanBanks: ["HDFC Bank"],
                locationAdvantages: [],
            },
        };
        const out = renderList([message({ blocks: [details] })]);
        assert.match(out, /class="rec-pd__name"[^>]*>Experion Emerelle Reserve</);
        assert.match(out, /rec-pd__tag--status">Pre-Launch</);
        assert.match(out, /<dt>Booking<\/dt><dd[^>]*>₹21 L<\/dd>/);
        assert.match(out, /<th scope="row">3 BHK<\/th>/);
        assert.equal(out.match(/rec-pd__chips"><li/g)?.length, 1, "one row of nearby chips");
        assert.equal(out.match(/<strong>(Sector 55-56 Metro|IGI Airport|DPS|Medanta)<\/strong>/g)?.length, 3, "three nearby places up front");
        assert.match(out, /aria-expanded="false"[^>]*>More details/);
        assert.doesNotMatch(out, /Medanta|HDFC Bank/, "the rest waits behind More details");
        assert.match(out, /rec-pd__btn rec-pd__btn--primary".*Enquire.*Site visit.*Plan/);
    });

    it("rounds distances the way people say them", () => {
        assert.deepEqual([0.31, 0.98, 4.24, 18.6].map(formatDistance), ["300 m", "1000 m", "4.2 km", "19 km"]);
        const km = distanceKm({ lat: 28.4595, lng: 77.0266 }, { lat: 28.4089, lng: 77.0422 });
        assert.ok(km > 5.7 && km < 5.9, `Cyber City to Sohna Road is about 5.8 km, got ${km}`);
    });

    it("formats assistant text with bold, line breaks and lists, never as HTML", () => {
        const text = "**M3M Antalya Hills** is ready.\nBooking: ₹5 L\n\n- 10%: At booking\n- 90%: On possession\n1. First\n2. <b>Second</b>";
        assert.deepEqual(parseRichText(text), [
            { kind: "p", lines: ["**M3M Antalya Hills** is ready.", "Booking: ₹5 L"] },
            { kind: "ul", items: ["10%: At booking", "90%: On possession"] },
            { kind: "ol", items: ["First", "<b>Second</b>"] },
        ]);
        const out = renderList([message({ blocks: [{ type: "text", data: { text } }] })]);
        assert.match(out, /<p><strong>M3M Antalya Hills<\/strong> is ready\.<br\/>Booking: ₹5 L<\/p>/);
        assert.match(out, /<ul><li>10%: At booking<\/li><li>90%: On possession<\/li><\/ul>/);
        assert.ok(out.includes("<li>&lt;b&gt;Second&lt;/b&gt;</li>"), "HTML in a reply stays text");
        assert.deepEqual(parseRichText("Typing **Pri"), [{ kind: "p", lines: ["Typing **Pri"] }]);
        assert.ok(
            renderList([message({ blocks: [{ type: "text", data: { text: "Near *(Sector 49 / Sohna Road)* now" } }] })]).includes(
                "Near <em>(Sector 49 / Sohna Road)</em> now",
            ),
        );
        assert.ok(renderList([message({ blocks: [{ type: "text", data: { text: "Typing **Pri" } }] })]).includes("Typing Pri"), "an unclosed marker is hidden");
    });

    it("turns the send button into a stop button while a reply is coming", () => {
        const props = { placeholder: "Ask", disabled: false, validate: () => null, onSend: () => true, onStop: () => {} };
        const idle = renderToStaticMarkup(createElement(Composer, { ...props, busy: false }));
        assert.match(idle, /aria-label="Send message"/);
        assert.doesNotMatch(idle, /Stop reply/);
        const busy = renderToStaticMarkup(createElement(Composer, { ...props, busy: true }));
        assert.match(busy, /class="rec-send rec-send--stop" aria-label="Stop reply"/);
        assert.doesNotMatch(busy, /Send message/);
        assert.match(renderToStaticMarkup(createElement(Composer, { ...props, busy: true, stopping: true })), /disabled="" aria-label="Stopping reply"/);
        const stopped = renderList([message({ status: "failed", blocks: [], error: { code: "CANCELLED", message: "You stopped this reply.", retryable: true } })]);
        assert.ok(stopped.includes("rec-notice--notice") && stopped.includes("You stopped this reply.") && stopped.includes("Retry"));
    });

    it("says how many results are shown and prepares infinite loading without a blank card", () => {
        const query = { keywords: null, bedrooms: 3, budgetMinInr: null, budgetMaxInr: 30_000_000, category: null, nearProjectId: null, withinKm: null };
        const block: ChatBlock = { type: "property_cards", data: { title: "3 BHK", items: [card, fixture], totalResults: 33, notice: null, criteria: null, query } };
        const loadMoreProperties = () => new Promise<never>(() => {});
        const out = renderList([message({ blocks: [block] })], defaultBlockRenderers, { loadMoreProperties });
        assert.ok(out.includes("2 of 33"));
        assert.match(out, /class="rec-sentinel"/);
        assert.doesNotMatch(out, /rec-more-card/);

        assert.doesNotMatch(renderList([message({ blocks: [block] })]), /rec-sentinel/, "no loader without a data source");
        const handPicked = { ...block, data: { ...block.data, query: null } } as ChatBlock;
        assert.doesNotMatch(renderList([message({ blocks: [handPicked] })], defaultBlockRenderers, { loadMoreProperties }), /rec-sentinel/);
        const all = { ...block, data: { ...block.data, totalResults: 2 } } as ChatBlock;
        const allOut = renderList([message({ blocks: [all] })], defaultBlockRenderers, { loadMoreProperties });
        assert.ok(allOut.includes("2 results") && !allOut.includes("rec-sentinel"));
    });

    it("asks clarifying questions one at a time, with numbered answers", () => {
        const block = allBlocks.find((b) => b.type === "clarification")!;
        assert.ok(block.type === "clarification");
        const out = html(
            createElement(IconProvider, { value: resolveIcons() },
                createElement(AskPanel, { block, busy: false, onAnswer: () => {}, onClose: () => {} }),
            ),
        );
        assert.ok(out.includes("Question 1 of 1") && out.includes("What is your budget?"));
        assert.match(out, /rec-ask__key" aria-hidden="true">1<\/span><span class="rec-ask__choice-label">Under ₹1 Cr/);
        assert.ok(out.includes("Or type your answer") && out.includes("Skip"));

        const questions = [
            { id: "a", text: "What is your budget?", criterion: "budget" as const, options: [] },
            { id: "b", text: "Which area?", criterion: null, options: [] },
            { id: "c", text: "BHK?", criterion: "bedrooms" as const, options: [] },
        ];
        assert.equal(answersMessage(questions, ["₹1–2 Cr", "Sohna Road", null]), "Budget: ₹1–2 Cr; Which area: Sohna Road", "skipped ones left out");
        assert.equal(answersMessage(questions, [null, null, " "]), "");
    });

    it("walks through a form one field at a time, and checks each answer", () => {
        const form = allBlocks.find((b) => b.type === "lead_capture_form")!;
        assert.ok(form.type === "lead_capture_form");
        const out = html(
            createElement(IconProvider, { value: resolveIcons() },
                createElement(AskPanel, { block: form, busy: false, onAnswer: () => {}, onClose: () => {} }),
            ),
        );
        assert.ok(out.includes(`1 of ${form.data.fields.length}`) && out.includes("Full name"));
        assert.ok(!out.includes("Mobile number"), "only the current field");

        const phone = form.data.fields.find((f) => f.input === "tel") ?? { name: "phone", label: "Mobile number", input: "tel" as const, required: true, placeholder: null, maxLength: null, options: null };
        assert.equal(fieldError(phone, "98765 43210"), null);
        assert.equal(fieldError(phone, "+919876543210"), null);
        assert.equal(fieldError(phone, "+447700900123"), null);
        assert.match(fieldError(phone, "12345") ?? "", /10-digit/);
        assert.match(fieldError(phone, "") ?? "", /Please enter/);
        const email = { ...phone, name: "email", label: "Email", input: "email" as const, required: false };
        assert.equal(fieldError(email, ""), null, "optional may be empty");
        assert.match(fieldError(email, "nope") ?? "", /valid email/);
    });

    it("fills in what the site knows about the visitor and asks only the rest", () => {
        const form = allBlocks.find((b) => b.type === "site_visit_form")!;
        assert.ok(form.type === "site_visit_form");
        const fields = form.data.fields;
        assert.deepEqual(
            knownValues(fields, { name: " Asha Rao ", phone: "12345", email: "asha@example.com" }),
            { name: "Asha Rao", email: "asha@example.com" },
            "an invalid phone is asked for, not filled in",
        );

        const user = { name: "Asha Rao", phone: "98765 43210", email: "asha@example.com" };
        const out = html(
            createElement(IconProvider, { value: resolveIcons() },
                createElement(AskPanel, { block: form, busy: false, onAnswer: () => {}, onClose: () => {}, user }),
            ),
        );
        const asked = fields.filter((f) => !["name", "phone", "email"].includes(f.name));
        assert.ok(out.includes(`1 of ${asked.length}`), "known fields are not steps");
        assert.ok(out.includes(asked[0]!.label) && !out.includes("Full name"));
    });

    it("shows a form in the reply as a card that opens the panel, when the host has one", () => {
        const form = allBlocks.find((b) => b.type === "site_visit_form")!;
        const out = renderList([message({ blocks: [form] })], defaultBlockRenderers, { openForm: () => {}, formSent: () => false });
        assert.match(out, /rec-form-card/);
        assert.ok(out.includes("Fill in") && !out.includes("Preferred date"));
        const sent = renderList([message({ blocks: [form] })], defaultBlockRenderers, { openForm: () => {}, formSent: () => true });
        assert.ok(sent.includes("Request sent") && !sent.includes("Fill in"));
    });

    it("shows suggestion pills under the latest reply only", () => {
        const pills = allBlocks.find((b) => b.type === "quick_replies")!;
        const reply = (id: string) => message({ key: `a:${id}`, clientMessageId: id, blocks: [{ type: "text", data: { text: `Reply ${id}` } }, pills] });
        const out = renderList([reply("m1"), reply("m2")]);
        assert.equal((out.match(/class="rec-pills"/g) ?? []).length, 1);
        assert.ok(out.indexOf("rec-pills") > out.indexOf("Reply m2"), "under the newest reply");
        assert.ok(out.indexOf("rec-pills") > out.lastIndexOf("rec-bubble--assistant"), "outside the bubble");

        const asked = (id: string) => message({ key: `a:${id}`, clientMessageId: id, blocks: [{ type: "text", data: { text: `Reply ${id}` } }], suggestions: [`Next ${id}?`] });
        const questions = renderList([asked("m1"), asked("m2")]);
        assert.ok(questions.includes("Next m2?") && !questions.includes("Next m1?"), "suggested questions too");
        assert.match(questions, /aria-label="Suggested questions"/);
    });

    it("draws the payment plan as a donut in payment order, numbered to match its list", () => {
        const plan = allBlocks.find((b) => b.type === "payment_plan")!;
        const out = renderList([message({ blocks: [plan] })]);
        assert.equal((out.match(/class="rec-plan__slice/g) ?? []).length, 2);
        assert.equal((out.match(/class="rec-plan__key"/g) ?? []).length, 2);
        assert.ok(out.includes("in 2 payments"), "the centre sums the plan");
        assert.match(out, /aria-label="Payment plan in 2 stages: 10% At booking; 90% On possession"/);
        assert.ok(out.indexOf("var(--rec-color-primary) 40.0%") < out.indexOf("var(--rec-color-primary) 100.0%"), "earliest stage is lightest");

        const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
        const slices = planSlices([10, 0, 90]);
        assert.deepEqual(slices.map((s) => s.index), [0, 2], "a 0% stage has no slice");
        assert.ok(close(slices[0]!.end, 0.1) && close(slices[1]!.end, 1));
        assert.ok(close(planSlices([60, 50]).at(-1)!.end, 1), "over 100% is scaled to the ring");
        assert.ok(close(planSlices([50, 30]).at(-1)!.end, 0.8), "under 100% leaves a gap");
    });

    it("lets callers override a block renderer", () => {
        const CustomText = ({ block }: BlockProps<"text">) => createElement("em", { "data-custom": "yes" }, block.data.text);
        const out = renderList([message({ blocks: [allBlocks[0]!] })], { ...defaultBlockRenderers, text: CustomText });
        assert.match(out, /<em data-custom="yes">/);
    });
});

describe("pluggable icons", () => {
    it("accepts a real icon library by export name (lucide-react)", () => {
        const out = html(createElement(ChatWidget, {
            api: fakeApi,
            storageKey: null,
            icons: { library: Lucide, names: { send: "Send", newChat: "SquarePen", building: "Building2" } },
        }));
        assert.match(out, /lucide-send/);
        assert.match(out, /lucide-square-pen/);
        assert.match(out, /lucide-building-?2/);
    });

    it("accepts components directly and falls back for anything missing", () => {
        const Star = (props: { size?: number; className?: string }) =>
            createElement("svg", { "data-icon": "star", width: props.size, className: props.className });
        const icons = resolveIcons({ send: Star });
        assert.equal(icons.send.component, Star);
        assert.notEqual(icons.retry.component, Star);
        assert.deepEqual(Object.keys(icons).sort(), [...ICON_NAMES].sort(), "every icon name resolves");
    });

    it("warns about unknown export names and uses the built-in icon", () => {
        const warn = mock.method(console, "warn", () => {});
        try {
            const icons = resolveIcons({ library: Lucide, names: { send: "NoSuchIcon", retry: "RotateCw" } });
            assert.equal(icons.retry.component, Lucide.RotateCw);
            assert.notEqual(icons.send.component, undefined);
            assert.equal(warn.mock.callCount(), 1);
            assert.match(String(warn.mock.calls[0]?.arguments[0]), /NoSuchIcon/);
        } finally {
            warn.mock.restore();
        }
    });

    it("passes library-wide props such as strokeWidth", () => {
        const out = html(createElement(ChatWidget, {
            api: fakeApi, storageKey: null,
            icons: { library: Lucide, names: { send: "Send" }, props: { strokeWidth: 1.25 } },
        }));
        assert.match(out, /class="lucide lucide-send[^"]*"[^>]*stroke-width="1.25"|stroke-width="1.25"[^>]*class="lucide lucide-send/);
    });
});

describe("pluggable themes", () => {
    it("applies a preset, overrides and custom named themes as CSS variables", () => {
        const dark = html(createElement(ChatWidget, { api: fakeApi, storageKey: null, theme: "dark" }));
        assert.match(dark, /--rec-color-primary:#5FC4A8/);
        assert.match(dark, /data-theme="dark"/);

        const custom = html(createElement(ChatWidget, {
            api: fakeApi, storageKey: null,
            theme: "brand",
            themes: { brand: { base: "light", colorPrimary: "#0047AB", radius: "4px" } },
        }));
        assert.match(custom, /--rec-color-primary:#0047AB/);
        assert.match(custom, /--rec-radius:4px/);
        assert.match(custom, /data-theme="light"/);
    });
});

describe("starter questions", () => {
    it("turns taps into one message a person would type", () => {
        assert.equal(
            starterMessage({ purpose: "Invest", type: "Apartment", bedrooms: "3 BHK", budget: "₹1.5–3 Cr", locality: "Sohna Road" }),
            "I want to invest in a 3 BHK apartment on Sohna Road, budget ₹1.5–3 Cr.",
        );
        assert.equal(starterMessage({ type: "Plot", bedrooms: "3 BHK", budget: "Under ₹1.5 Cr" }), "I'm looking to buy a plot in Gurugram, under ₹1.5 Cr.");
        assert.equal(starterMessage({ purpose: "Just exploring", budget: "₹5 Cr+" }), "I'm exploring homes in Gurugram, budget ₹5 Cr or more.");
        assert.equal(starterMessage({ type: "Apartment" }), "I'm looking to buy an apartment in Gurugram.");
    });
});
