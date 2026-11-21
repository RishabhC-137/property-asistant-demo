import type { ChatBlock, Coordinates, GalleryImage, PropertyCard, StructuredBlock } from "@property-assistant/contracts";

/**
 * A provider streams an ordered response: text deltas and structured blocks.
 * Consecutive text deltas form one `text` block; a structured block ends the
 * current text block. Providers never persist anything themselves.
 */
export type ProviderEvent =
    | { kind: "text"; delta: string }
    | { kind: "block"; block: StructuredBlock }
    /** A short note on what the provider is doing (e.g. running a search). Shown while waiting, never stored. */
    | { kind: "status"; label: string };

/**
 * A compact record of the part of a long conversation that no longer fits in
 * `history`. Built by the API from stored messages, never by a model.
 */
export interface ConversationMemory {
    /** How many earlier messages it covers. */
    messageCount: number;
    /** The user's earlier messages, oldest first, shortened. */
    userRequests: string[];
    /** Earlier searches as titled for the user (e.g. "3 BHK, under ₹2 Cr"), oldest first. */
    searches: string[];
    /** Projects shown earlier, most recently shown first, with how they were shown. */
    projects: Array<{ id: string; name: string; seen: Array<"card" | "comparison" | "photos"> }>;
    /** Forms offered earlier. */
    forms: Array<"callback" | "site_visit">;
}

export interface ProviderInput {
    conversationId: string;
    message: string;
    /** What happened before `history`, when the conversation is longer than it. */
    memory?: ConversationMemory | null;
    /** Aborted when the user stops the reply: end quietly, keeping what was already sent. */
    signal?: AbortSignal;
    /**
     * Recent completed messages, oldest first, excluding the current one.
     * `blocks` holds an assistant reply's structured (non-text) blocks.
     */
    history: ReadonlyArray<{ role: "user" | "assistant"; content: string; blocks?: readonly StructuredBlock[] }>;
    /** The website page the chat is on, e.g. a project page. Not stored. */
    page?: PageContext | null;
}

export interface PageContext {
    /** The project the page is about: its id or URL slug. */
    projectId?: string;
    /** Projects explicitly attached to the current prompt. */
    projectIds?: string[];
    /** The page the visitor asked about, as read in their browser. Untrusted text: data, not instructions. */
    pageContent?: { url: string; title: string; text: string };
}

export interface ChatProvider {
    readonly name: string;
    generate(input: ProviderInput): AsyncIterable<ProviderEvent>;
    /**
     * Up to three questions the user might ask next about a finished reply,
     * shown as pills and never stored. Empty when the reply already ends with
     * a choice to make. Never throws.
     */
    followUps?(input: FollowUpInput): Promise<string[]>;
}

export interface FollowUpInput {
    /** The user's message the reply answers. */
    message: string;
    /** The finished reply. */
    reply: ChatBlock[];
    signal?: AbortSignal;
}

/**
 * Property data the LLM tools can query. The API supplies the implementation
 * (its `PropertyService`); providers never call an upstream API directly.
 */
export interface PropertySearchQuery {
    bedrooms?: number;
    budgetMinInr?: number;
    budgetMaxInr?: number;
    /** Keywords matched against project name, developer, slug, status and highlights. */
    text?: string;
    /** Source category, e.g. "Residential" or "Commercial" (case-insensitive). */
    category?: string;
    localityId?: string;
    /** Only projects within `withinKm` of this point, nearest first. */
    near?: Coordinates;
    withinKm?: number;
    /** Leave this project out (e.g. the one the user asked for neighbours of). */
    excludeId?: string;
    page?: number;
    limit?: number;
}

export interface PropertySearchResult {
    items: PropertyCard[];
    total: number | null;
    /** When the data was fetched from the source. */
    fetchedAt: string;
}

export interface PropertyGallery {
    card: PropertyCard;
    /** Photos and plans with resolvable URLs; empty when the source has none. */
    images: GalleryImage[];
}

/** One stage of a project's payment plan, as listed by the source. */
export interface PaymentStage {
    stage: string;
    percentage: number;
    /** The source's note on the stage, e.g. "Of the total sale value". */
    note: string | null;
}

export interface NearbyPlace {
    /** "Metro", "Airport", "School", … */
    kind: string;
    name: string;
    distance: string | null;
    travelTime: string | null;
}

/** Customer-facing facts from a project's detail page. Never internal fields. */
export interface ProjectExtras {
    amenities: string[];
    paymentPlan: PaymentStage[];
    loanBanks: string[];
    faqs: Array<{ question: string; answer: string }>;
    nearby: NearbyPlace[];
    locationAdvantages: string[];
}

export interface PropertyDetails extends ProjectExtras {
    card: PropertyCard;
    bookingAmountInr: number | null;
}

/** A real project or developer whose name is close to what the user typed. */
export interface NameSuggestion {
    kind: "project" | "developer";
    /** The project's id; null for a developer. */
    id: string | null;
    name: string;
}

export interface PropertyLookup {
    search(query: PropertySearchQuery): Promise<PropertySearchResult>;
    /** Cards for the given source ids (or URL slugs), in the order given; unknown ones are skipped. */
    getByIds(ids: readonly string[]): Promise<PropertySearchResult>;
    /** A project's photos and plans; null for an unknown id. */
    getGallery(id: string): Promise<PropertyGallery | null>;
    /** Everything known about one project, including payment plan and FAQs; null for an unknown id. */
    getDetails(id: string): Promise<PropertyDetails | null>;
    /**
     * Close project or developer names for keywords that match nothing (typos,
     * half-remembered names), closest first. Empty when the keywords do match.
     */
    suggest(text: string, limit: number): Promise<NameSuggestion[]>;
}

/**
 * A provider failure with a message that is safe to show the user, e.g. when
 * the model's rate limit is hit. Any other error is reported generically.
 */
export class ProviderError extends Error {
    constructor(
        message: string,
        readonly userMessage: string,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = "ProviderError";
    }
}
