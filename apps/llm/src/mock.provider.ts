import { COMPANY } from "./company.js";
import type { SearchCriterion, StructuredBlock } from "@property-assistant/contracts";
import { DEMO_PROJECTS, findDemoProject, FIXTURE_NOTICE, FIXTURE_PROPERTIES } from "./fixtures.js";
import { LEAD_FORM, SITE_VISIT_FORM, withProjectOptions } from "./forms.js";
import type { ChatProvider, ProviderEvent, ProviderInput } from "./types.js";

/**
 * Deterministic, keyword-driven provider for development and tests. The same
 * message always yields the same events. It performs no real search: any
 * property data comes from clearly labelled fictional fixtures.
 */
export interface MockProviderOptions {
    /** Delay between text chunks; 0 for tests. */
    chunkDelayMs?: number;
}

interface Turn {
    text: string;
    blocks: StructuredBlock[];
}

const QUESTIONS: Record<"budget" | "bedrooms", { id: string; text: string; options: string[] }> = {
    budget: { id: "budget", text: "What is your budget range?", options: ["Under ₹2 Cr", "₹2–4 Cr", "Above ₹4 Cr"] },
    bedrooms: { id: "bedrooms", text: "How many bedrooms (BHK) are you looking for?", options: ["2 BHK", "3 BHK", "4 BHK"] },
};

const QUICK_REPLIES: Record<"budget" | "bedrooms" | "start" | "next" | "officeNext", StructuredBlock> = {
    budget: {
        type: "quick_replies",
        data: {
            prompt: "Pick a budget",
            options: [
                { id: "budget_under_2cr", label: "Under ₹2 Cr", value: "Budget under 2 crore" },
                { id: "budget_2_4cr", label: "₹2–4 Cr", value: "Budget 2 to 4 crore" },
                { id: "budget_above_4cr", label: "Above ₹4 Cr", value: "Budget above 4 crore" },
            ],
        },
    },
    bedrooms: {
        type: "quick_replies",
        data: {
            prompt: "Pick a configuration",
            options: [
                { id: "bhk_2", label: "2 BHK", value: "2 BHK" },
                { id: "bhk_3", label: "3 BHK", value: "3 BHK" },
                { id: "bhk_4", label: "4 BHK", value: "4 BHK" },
            ],
        },
    },
    start: {
        type: "quick_replies",
        data: {
            prompt: null,
            options: [
                { id: "search_3bhk", label: "Find a 3 BHK", value: "Show me 3 BHK flats under 4 crore" },
                { id: "compare", label: "Compare projects", value: "Compare projects" },
                { id: "callback", label: "Request a callback", value: "Please call me back" },
            ],
        },
    },
    next: {
        type: "quick_replies",
        data: {
            prompt: "What next?",
            options: [
                { id: "compare", label: "Compare these", value: "Compare these projects" },
                { id: "site_visit", label: "Request a site visit", value: "I want a site visit" },
                { id: "callback", label: "Request a callback", value: "Please call me back" },
            ],
        },
    },
    officeNext: {
        type: "quick_replies",
        data: {
            prompt: "What would you like to know next?",
            options: [
                { id: "sizes", label: "Office sizes", value: "Tell me about Meridian Workyards" },
                { id: "location", label: "Location", value: "Where is Meridian Workyards?" },
                { id: "callback", label: "Request a callback", value: "Please call me back" },
            ],
        },
    },
};

const PROPERTY_INTENT =
    /\b(bhk|flats?|apartments?|propert(y|ies)|projects?|villas?|homes?|offices?|commercial|buy|budget|crore|cr|lakh|sector)\b/;
const COMMERCIAL_SEARCH = /\bcommercial\b|\boffices?\s+(?:spaces?|projects?|units?|properties?)\b/;
const BEDROOMS = /\b\d(\.5)?\s*bhk\b/;
const BUDGET = /\b(\d+(\.\d+)?\s*(cr|crore|crores|lakh|lakhs|lac|l)\b|budget\b)/;

const COMPANY_INTENT =
    /\b(founders?|founded|owners?|ceo|who (runs|owns|started)|your (office|address|website|company|number|phone)|where (are you|is your office)|office|website|about (you|catalog|your company|the company))\b/;

export function respond(message: string): Turn {
    const text = message.toLowerCase();

    if (/\b(payment plan|payment schedule|installments?|how (do|can) i pay)\b/.test(text)) {
        const project = findDemoProject(message);
        return {
            text: `Here is the payment schedule for ${project.card.name}. It is illustrative demo data, not a real offer.`,
            blocks: [
                {
                    type: "payment_plan",
                    data: {
                        projectId: project.card.id,
                        projectName: project.card.name,
                        bookingAmountInr: project.bookingAmountInr,
                        stages: project.paymentPlan,
                        notice: FIXTURE_NOTICE,
                    },
                },
            ],
        };
    }

    if (/\b(photos?|pictures?|gallery|images?)\b/.test(text)) {
        const project = findDemoProject(message);
        return {
            text: `A few sample views for ${project.card.name}. The photos are illustrative, not verified project photography.`,
            blocks: [
                {
                    type: "property_gallery",
                    data: {
                        projectId: project.card.id,
                        projectName: project.card.name,
                        images: project.gallery,
                        detailUrl: null,
                    },
                },
            ],
        };
    }

    if (
        /\b(location|map)\b/.test(text) ||
        (/\bwhere is\b/.test(text) && !COMPANY_INTENT.test(text))
    ) {
        const project = findDemoProject(message);
        const { localityName, city, coordinates } = project.card.location;
        if (coordinates) {
            return {
                text: `${project.card.name} is shown in ${[localityName, city].filter(Boolean).join(", ")}. This demo location is approximate.`,
                blocks: [
                    {
                        type: "project_map",
                        data: {
                            projectId: project.card.id,
                            projectName: project.card.name,
                            coordinates,
                            address: [localityName, city].filter(Boolean).join(", ") || null,
                        },
                    },
                ],
            };
        }
    }

    if (/\b(project details|tell me about|more about|details of|booking amount|amenities|home loans)\b/.test(text)) {
        const project = findDemoProject(message);
        return {
            text: `Here are the sample details for ${project.card.name}. All project information is fictional demo data.`,
            blocks: [
                {
                    type: "project_details",
                    data: {
                        project: project.card,
                        bookingAmountInr: project.bookingAmountInr,
                        nearby: project.nearby,
                        loanBanks: project.loanBanks,
                        locationAdvantages: project.locationAdvantages,
                    },
                },
            ],
        };
    }

    if (COMPANY_INTENT.test(text) && !COMMERCIAL_SEARCH.test(text)) {
        const founder = /\b(founders?|founded|owners?|ceo|who (runs|owns|started))\b/.test(text);
        return {
            text: [
                founder
                    ? COMPANY.founder
                        ? `${COMPANY.name} was founded by ${COMPANY.founder}.`
                        : `I don't have the founder's details to hand. You can leave a callback request and the team can share more.`
                    : `${COMPANY.name} is a fictional property advisory with sample homes and workspaces around Gurugram.`,
                `**About:** ${COMPANY.about}`,
                `**Office:** ${COMPANY.office}`,
                ...(COMPANY.phone ? [`**Phone:** ${COMPANY.phone}`] : []),
                ...(COMPANY.email ? [`**Email:** ${COMPANY.email}`] : []),
                `**Website:** ${COMPANY.website}`,
            ].join("\n"),
            blocks: [],
        };
    }

    if (/\b(compare|comparison|versus|vs)\b/.test(text)) {
        return {
            text: "Here is a side-by-side comparison of fictional demo projects.",
            blocks: [
                {
                    type: "property_comparison",
                    data: {
                        title: "Project comparison (demo data)",
                        items: [...FIXTURE_PROPERTIES],
                        attributes: ["price", "price_per_sqft", "configurations", "possession_date", "status"],
                        notice: FIXTURE_NOTICE,
                    },
                },
            ],
        };
    }

    if (/\b(site visit|visit)\b/.test(text)) {
        return {
            text: "Choose whether you want to book a free site visit or an online presentation. I will collect the project, schedule, contact details and the matching travel or meeting preference.",
            blocks: [withProjectOptions(SITE_VISIT_FORM, FIXTURE_PROPERTIES)],
        };
    }

    if (/\b(call ?back|call me|contact|advisor|agent|enquir(y|e))\b/.test(text)) {
        return {
            text: "Sure — share your details and an advisor can get back to you.",
            blocks: [LEAD_FORM],
        };
    }

    if (PROPERTY_INTENT.test(text)) {
        const missing: Array<"budget" | "bedrooms"> = [];
        const commercial = COMMERCIAL_SEARCH.test(text);
        if (!BUDGET.test(text)) missing.push("budget");
        if (!commercial && !BEDROOMS.test(text)) missing.push("bedrooms");

        if (missing.length > 0) {
            const missingCriteria: SearchCriterion[] = missing;
            return {
                text: "Happy to help you search. A couple of details will narrow things down.",
                blocks: [
                    {
                        type: "clarification",
                        data: {
                            questions: missing.map((c) => ({ ...QUESTIONS[c], criterion: c })),
                            missingCriteria,
                        },
                    },
                ],
            };
        }

        const results = FIXTURE_PROPERTIES.filter((project) =>
            commercial ? project.category === "Commercial" : project.category === "Residential",
        );
        return {
            text: commercial
                ? "I don't have a sample workspace listed in New Metro. Meridian Workyards is a fictional example in Sector 44, Gurugram. Would you like to see its suite sizes or location?"
                : "Here are some sample results. Live search is not connected yet, so these are fictional demo projects only.",
            blocks: [
                {
                    type: "property_cards",
                    data: {
                        title: "Sample results (demo data)",
                        items: results,
                        totalResults: null,
                        notice: FIXTURE_NOTICE,
                        criteria: null,
                        query: null,
                    },
                },
                commercial ? QUICK_REPLIES.officeNext : QUICK_REPLIES.next,
            ],
        };
    }

    if (/\b(hi|hello|hey|namaste|namaskar)\b/.test(text)) {
        return {
            text: "Hi! I can help you compare sample homes and workspaces around Gurugram, or request a callback.",
            blocks: [QUICK_REPLIES.start],
        };
    }

    return {
        text: "I can help with property search, comparisons and callback or site-visit requests. What would you like to do?",
        blocks: [QUICK_REPLIES.start],
    };
}

/** Splits text into word-sized chunks; deterministic for a given input. */
export function chunkText(text: string): string[] {
    return text.match(/\S+\s*/g) ?? [text];
}

/** "Ask about this page": the mock can only read the page back, so it gives its title and opening. */
export function aboutPage(page: { url: string; title: string; text: string }): Turn {
    const opening = page.text.trim().replace(/\s+/g, " ").slice(0, 220);
    return {
        text: `You're on "${page.title || page.url}". It starts: ${opening}${opening.length === 220 ? "…" : ""}`,
        blocks: [],
    };
}

export class MockChatProvider implements ChatProvider {
    readonly name = "mock";
    private readonly chunkDelayMs: number;

    constructor(options: MockProviderOptions = {}) {
        this.chunkDelayMs = options.chunkDelayMs ?? 0;
    }

    async *generate(input: ProviderInput): AsyncIterable<ProviderEvent> {
        const turn = input.page?.pageContent?.text.trim() ? aboutPage(input.page.pageContent) : respond(input.message);
        for (const delta of chunkText(turn.text)) {
            if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
            yield { kind: "text", delta };
        }
        for (const block of turn.blocks) yield { kind: "block", block };
    }
}
