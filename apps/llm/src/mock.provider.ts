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

const QUICK_REPLIES: Record<"budget" | "bedrooms" | "start" | "next", StructuredBlock> = {
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
};

const PROPERTY_INTENT =
    /\b(bhk|flats?|apartments?|studios?|propert(y|ies)|projects?|villas?|homes?|offices?|workspaces?|commercial|retail|shops?|plots?|land|warehouses?|industrial|buy|budget|crore|cr|lakh|sector)\b/;
const COMMERCIAL_SEARCH =
    /\b(?:commercial|offices?|workspaces?|retail|shops?|warehouses?|industrial)\b|\b(?:offices?|workspaces?)\s+(?:spaces?|projects?|units?|properties?)\b/;
const OFFICE_SEARCH = /\b(?:offices?|workspaces?)\b/;
const RETAIL_SEARCH = /\b(?:retail|shops?|stores?)\b/;
const WAREHOUSE_SEARCH = /\b(?:warehouses?|industrial)\b/;
const PROPERTY_REQUEST =
    /\b(?:buy|looking|search|find|show|commercial|projects?|budget|bhk|flats?|apartments?|studios?|villas?|homes?|retail|shops?|plots?|land|warehouses?|industrial)\b|\b(?:offices?|workspaces?)\s+(?:spaces?|projects?|units?|properties?)\b/;
const PLOT_SEARCH = /\b(?:plots?|land)\b/;
const STUDIO_SEARCH = /\bstudios?\b/;
const BEDROOMS = /\b(\d(?:\.5)?)\s*bhk\b/;
const BUDGET =
    /\b(?:budget\b|\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*(?:cr|crore|crores|lakh|lakhs|lac|l)\b|\d+(?:\.\d+)?\s*(?:cr|crore|crores|lakh|lakhs|lac|l)\b)/;
const BUDGET_RANGE =
    /(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(cr|crores?|lakh|lakhs|lac|l)\b/i;
const SINGLE_BUDGET =
    /\b(under|below|less than|up to|upto|within|above|over|more than|budget)\b[^\d₹]{0,16}₹?\s*(\d+(?:\.\d+)?)\s*(cr|crores?|lakh|lakhs|lac|l)\b/i;
const KNOWN_PLACES = [
    ...new Set(
        DEMO_PROJECTS.flatMap(({ card }) => [card.location.localityName, card.location.city])
            .filter((location): location is string => Boolean(location)),
    ),
];

const COMPANY_INTENT =
    /\b(founders?|founded|owners?|ceo|who (runs|owns|started)|your (office|address|website|company|number|phone)|where (are you|is your office)|office|website|about (you|catalog|your company|the company))\b/;

function normalizePlace(value: string): string {
    return value
        .toLowerCase()
        .replace(/\bext\.?\b/g, "extension")
        .replace(/\brd\.?\b/g, "road")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function budgetRange(message: string): { min: number | null; max: number | null } | null {
    const multiplier = (unit: string) => (/^(?:cr|crore)/i.test(unit) ? 10_000_000 : 100_000);
    const range = message.match(BUDGET_RANGE);
    if (range) {
        const unit = multiplier(range[3]!);
        return { min: Number(range[1]) * unit, max: Number(range[2]) * unit };
    }

    const single = message.match(SINGLE_BUDGET);
    if (!single) return null;
    const amount = Number(single[2]) * multiplier(single[3]!);
    return /^(?:above|over|more than)$/i.test(single[1]!) ? { min: amount, max: null } : { min: null, max: amount };
}

function projectMatchesPlace(project: (typeof DEMO_PROJECTS)[number], query: string): boolean {
    const normalizedQuery = normalizePlace(query);
    const requestedPlace = query.match(/\b(?:in|on|near)\s+(.+?)(?=,\s*(?:budget|price)|\s+(?:budget|under|below|above|within)\b|$)/i)?.[1];
    if (requestedPlace) {
        const normalizedRequestedPlace = normalizePlace(requestedPlace);
        const recognized = KNOWN_PLACES.some((place) => normalizedRequestedPlace.includes(normalizePlace(place)));
        const extensionRoad = normalizedRequestedPlace.includes("golf course extension road");
        if (!recognized && !extensionRoad) return false;
    }

    for (const location of KNOWN_PLACES) {
        if (!normalizedQuery.includes(normalizePlace(location))) continue;
        const matches = location === project.card.location.city || location === project.card.location.localityName;
        if (!matches) return false;
    }

    const mentionsExtensionRoad = normalizedQuery.includes("golf course extension road");
    if (mentionsExtensionRoad) {
        const locationText = [
            ...project.card.highlights,
            ...project.locationAdvantages,
            ...project.nearby.map((place) => place.name),
        ]
            .map(normalizePlace)
            .join(" ");
        return locationText.includes("golf course extension road");
    }
    return true;
}

function projectMatchesBudget(project: (typeof DEMO_PROJECTS)[number], range: ReturnType<typeof budgetRange>): boolean {
    if (!range) return true;
    const min = project.card.price?.min ?? project.card.price?.max ?? 0;
    const max = project.card.price?.max ?? project.card.price?.min ?? 0;
    return (range.max === null || min <= range.max) && (range.min === null || max >= range.min);
}

function isClarificationReply(history: ProviderInput["history"]): boolean {
    const lastAssistant = [...history].reverse().find((entry) => entry.role === "assistant");
    return lastAssistant?.blocks?.some((block) => block.type === "clarification") ?? false;
}

function searchContextForReply(message: string, history: ProviderInput["history"]): string | null {
    if (!isClarificationReply(history)) return null;

    const previousRequests: string[] = [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const entry = history[index]!;
        if (entry.role === "assistant") {
            if (entry.blocks?.some((block) => block.type === "clarification")) continue;
            break;
        }
        previousRequests.unshift(entry.content);
    }

    return [...previousRequests, message].join(" ");
}

export function respond(message: string, history: ProviderInput["history"] = []): Turn {
    const text = message.toLowerCase();
    const searchContext = searchContextForReply(message, history);

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

    if (COMPANY_INTENT.test(text) && !PROPERTY_REQUEST.test(text)) {
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
                        items: FIXTURE_PROPERTIES.slice(0, 4),
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

    if (PROPERTY_INTENT.test(text) || searchContext !== null) {
        const searchText = (searchContext ?? message).toLowerCase();
        const missing: Array<"budget" | "bedrooms"> = [];
        const commercial = COMMERCIAL_SEARCH.test(searchText);
        const plot = PLOT_SEARCH.test(searchText);
        const studio = STUDIO_SEARCH.test(searchText);
        if (!BUDGET.test(searchText)) missing.push("budget");
        if (!commercial && !plot && !studio && !BEDROOMS.test(searchText)) missing.push("bedrooms");

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

        const bedroomCount = searchText.match(BEDROOMS)?.[1];
        const requestedBedrooms = bedroomCount ? Number(bedroomCount) : null;
        const budget = budgetRange(searchText);
        const results = DEMO_PROJECTS.filter((project) => {
            const card = project.card;
            if (studio) {
                if (!card.propertyTypes.some((type) => /\bstudio\b/i.test(type)) && !card.configurations.some((configuration) => /\bstudio\b/i.test(configuration.label))) {
                    return false;
                }
            } else if (plot) {
                if (!card.propertyTypes.some((type) => /\b(plot|land)\b/i.test(type))) return false;
            } else if (OFFICE_SEARCH.test(searchText)) {
                if (!card.propertyTypes.some((type) => /\boffice\b|\bworkspace\b/i.test(type))) return false;
            } else if (RETAIL_SEARCH.test(searchText)) {
                if (!card.propertyTypes.some((type) => /\bretail\b|\bshop\b/i.test(type))) return false;
            } else if (WAREHOUSE_SEARCH.test(searchText)) {
                if (!card.propertyTypes.some((type) => /\bwarehouse\b|\bindustrial\b/i.test(type))) return false;
            } else if (commercial) {
                if (card.category !== "Commercial") return false;
            } else if (card.category !== "Residential") {
                return false;
            }

            if (requestedBedrooms !== null && !card.configurations.some((configuration) => configuration.bedrooms === requestedBedrooms)) {
                return false;
            }
            return projectMatchesBudget(project, budget) && projectMatchesPlace(project, searchText);
        });
        const requestedPlace = searchText.match(/\b(?:in|on|near)\s+(.+?)(?=,\s*(?:budget|price)|\s+(?:budget|under|below|above|within)\b|$)/i)?.[1];
        return {
            text: results.length === 0 && requestedPlace
                ? `I don't have a sample ${OFFICE_SEARCH.test(searchText) ? "workspace" : studio ? "studio" : "property"} listed in ${requestedPlace.trim()}. These are fictional demo projects only.`
                : commercial
                  ? "Here are some sample commercial properties. Live listing search is not connected, so these are fictional demo projects only."
                  : plot
                    ? "Here are some sample plots. Live listing search is not connected, so these are fictional demo projects only."
                    : studio
                      ? "Here are some sample studio apartments. Live listing search is not connected, so these are fictional demo projects only."
                      : "Here are some sample results. Live search is not connected yet, so these are fictional demo projects only.",
            blocks: [
                ...(results.length > 0
                    ? [{
                        type: "property_cards" as const,
                        data: {
                            title: "Sample results (demo data)",
                            items: results.slice(0, 12).map(({ card }) => card),
                            totalResults: results.length,
                            notice: FIXTURE_NOTICE,
                            criteria: null,
                            query: null,
                        },
                    }]
                    : []),
                QUICK_REPLIES.next,
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
        const turn = input.page?.pageContent?.text.trim()
            ? aboutPage(input.page.pageContent)
            : respond(input.message, input.history);
        for (const delta of chunkText(turn.text)) {
            if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
            yield { kind: "text", delta };
        }
        for (const block of turn.blocks) yield { kind: "block", block };
    }
}
