import { distanceKm, type GalleryImage, type MoneyRange, type PropertyCard } from "@property-assistant/contracts";
import type { NameSuggestion, ProjectExtras, PropertyDetails } from "@property-assistant/llm";
import { mapCatalogProject, mapProjectExtras } from "./catalog.mapper.js";
import {
    UpstreamProjectDetailResponseSchema,
    UpstreamProjectDetailSchema,
    UpstreamProjectListResponseSchema,
} from "./catalog.schema.js";
import { suggestNames } from "./name-suggestions.js";
import type { PropertyGallery, PropertySearchQuery, PropertySearchResult, PropertyService } from "./property.service.js";

/**
 * Live `PropertyService` backed by `GET {apiBaseUrl}/projects`.
 *
 * The upstream catalogue is small (85 projects at the time of writing) and its
 * query filters are partial (`bhk` is ignored), so the whole catalogue is
 * fetched, validated and mapped once, cached for `cacheTtlMs`, and filtered
 * here. If a refresh fails, the last good catalogue keeps being served with
 * its original `fetchedAt`, so nothing is presented as fresher than it is.
 */
export interface CatalogOptions {
    apiBaseUrl: string;
    /** Images live at `{mediaBaseUrl}/{slug}/{file}`; null leaves image URLs unset. */
    mediaBaseUrl: string | null;
    timeoutMs: number;
    cacheTtlMs: number;
    log: { warn(obj: object, msg: string): void };
    fetch?: typeof fetch;
    now?: () => number;
}

interface Catalog {
    cards: PropertyCard[];
    /** List-endpoint data that is not on the card, by project id. */
    projectData: Map<string, { gallery: GalleryImage[]; bookingAmountInr: number | null; areaText: string }>;
    fetchedAt: Date;
}

const NO_EXTRAS: ProjectExtras = { amenities: [], paymentPlan: [], loanBanks: [], faqs: [], nearby: [], locationAdvantages: [] };

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const DEFAULT_RESULTS = 6;
// Public routes still validate their own smaller page size. Internal consumers such as
// the booking picker may request the complete cached catalogue.
const MAX_RESULTS = 100;
/** Radius for "near" searches when none is given. */
const DEFAULT_NEAR_KM = 5;
/** After a failed refresh, keep serving the previous copy this long before retrying. */
const RETRY_AFTER_FAILURE_MS = 60_000;
/** Detail-page facts (amenities, payment plans, FAQs) rarely change, so each project's are reused for hours. */
const EXTRAS_TTL_MS = 6 * 60 * 60_000;
/** A detail call only adds extras, so it may not hold a search up for long. */
const DETAIL_TIMEOUT_MS = 5_000;

export class CatalogPropertyService implements PropertyService {
    private cached: Catalog | null = null;
    private inflight: Promise<Catalog> | null = null;
    private lastFailureAt = -Infinity;
    private readonly extras = new Map<string, { value: ProjectExtras; expiresAt: number }>();
    private readonly fetch: typeof fetch;
    private readonly now: () => number;

    constructor(private readonly options: CatalogOptions) {
        this.fetch = options.fetch ?? globalThis.fetch;
        this.now = options.now ?? Date.now;
    }

    async search(query: PropertySearchQuery): Promise<PropertySearchResult> {
        const catalog = await this.catalog();
        const candidates = catalog.cards.flatMap((card) => {
            const price = relevantPrice(card, query.bedrooms);
            const match = matchesQuery(card, price, query, catalog.projectData.get(card.id)?.areaText ?? "");
            return match ? [{ card, price, match }] : [];
        });
        // Keywords that name a project or developer mean that one: a project whose
        // description only mentions it as a neighbour is not what was asked for.
        const named = candidates.filter((m) => m.match === "name");
        const matches = named.length > 0 ? named : candidates;

        // Near a point: nearest first. Otherwise, with a budget ceiling, what is closest to it first.
        if (query.near) {
            const from = query.near;
            const away = (card: PropertyCard) => distanceKm(from, card.location.coordinates!);
            matches.sort((a, b) => away(a.card) - away(b.card));
        } else if (query.budgetMaxInr !== undefined) {
            matches.sort((a, b) => (b.price?.min ?? b.price?.max ?? 0) - (a.price?.min ?? a.price?.max ?? 0));
        }

        const limit = Math.min(Math.max(query.limit ?? DEFAULT_RESULTS, 1), MAX_RESULTS);
        const start = (Math.max(query.page ?? 1, 1) - 1) * limit;
        return {
            items: await this.withAmenities(matches.slice(start, start + limit).map((m) => m.card)),
            total: matches.length,
            fetchedAt: catalog.fetchedAt.toISOString(),
        };
    }

    async getByIds(ids: readonly string[]): Promise<PropertySearchResult> {
        const catalog = await this.catalog();
        // A website page knows its project by URL slug, so a slug works as well as an id.
        const byId = new Map(catalog.cards.flatMap((c) => [[c.id, c] as const, ...(c.slug ? [[c.slug, c] as const] : [])]));
        const found = ids.flatMap((id) => byId.get(id) ?? []);
        const items = await this.withAmenities([...new Map(found.map((c) => [c.id, c])).values()]);
        return { items, total: items.length, fetchedAt: catalog.fetchedAt.toISOString() };
    }

    async getGallery(id: string): Promise<PropertyGallery | null> {
        const catalog = await this.catalog();
        const card = catalog.cards.find((c) => c.id === id);
        return card ? { card, images: catalog.projectData.get(id)?.gallery ?? [] } : null;
    }

    async getDetails(id: string): Promise<PropertyDetails | null> {
        const catalog = await this.catalog();
        const card = catalog.cards.find((c) => c.id === id);
        if (!card) return null;
        const extras = card.slug ? await this.extrasFor(card.slug) : NO_EXTRAS;
        return {
            ...extras,
            card: extras.amenities.length > 0 ? { ...card, amenities: extras.amenities } : card,
            bookingAmountInr: catalog.projectData.get(id)?.bookingAmountInr ?? null,
        };
    }

    async suggest(text: string, limit: number): Promise<NameSuggestion[]> {
        const catalog = await this.catalog();
        const query: PropertySearchQuery = { text };
        const matched = catalog.cards.some((card) => matchesQuery(card, null, query, catalog.projectData.get(card.id)?.areaText ?? ""));
        if (matched) return [];
        const projects = catalog.cards.map((c) => ({ id: c.id, name: c.name, developer: c.developer?.name ?? null }));
        return suggestNames(text, projects, limit);
    }

    async getBySlug(slug: string): Promise<PropertyCard | null> {
        const catalog = await this.catalog();
        const card = catalog.cards.find((c) => c.slug === slug);
        return card ? ((await this.withAmenities([card]))[0] ?? null) : null;
    }

    /**
     * The list endpoint has no amenities, so they are read from each returned
     * project's detail endpoint. A failed lookup leaves the card without
     * amenities rather than failing the search.
     */
    private withAmenities(cards: PropertyCard[]): Promise<PropertyCard[]> {
        return Promise.all(
            cards.map(async (card) => {
                const { amenities } = card.slug ? await this.extrasFor(card.slug) : NO_EXTRAS;
                return amenities.length > 0 ? { ...card, amenities } : card;
            }),
        );
    }

    /** Customer-facing facts from the detail endpoint (see `mapProjectExtras`); nothing else from it is used. */
    private async extrasFor(slug: string): Promise<ProjectExtras> {
        const cached = this.extras.get(slug);
        if (cached && this.now() < cached.expiresAt) return cached.value;
        try {
            const body = await this.getJson(
                `${this.options.apiBaseUrl}/projects/${encodeURIComponent(slug)}`,
                Math.min(this.options.timeoutMs, DETAIL_TIMEOUT_MS),
            );
            const parsed = UpstreamProjectDetailResponseSchema.safeParse(body);
            const value = parsed.success && parsed.data.success ? mapProjectExtras(parsed.data.data) : NO_EXTRAS;
            this.extras.set(slug, { value, expiresAt: this.now() + EXTRAS_TTL_MS });
            return value;
        } catch (error) {
            this.options.log.warn({ err: error, slug }, "could not load project details");
            // Keep any previous copy, and wait before asking a failing upstream again.
            const value = cached?.value ?? NO_EXTRAS;
            this.extras.set(slug, { value, expiresAt: this.now() + RETRY_AFTER_FAILURE_MS });
            return value;
        }
    }

    private async catalog(): Promise<Catalog> {
        const now = this.now();
        if (this.cached) {
            const fresh = now - this.cached.fetchedAt.getTime() < this.options.cacheTtlMs;
            const backingOff = now - this.lastFailureAt < RETRY_AFTER_FAILURE_MS;
            if (fresh || backingOff) return this.cached;
        }

        this.inflight ??= this.load()
            .then((catalog) => (this.cached = catalog))
            .catch((error: unknown) => {
                this.lastFailureAt = this.now();
                if (!this.cached) throw error;
                this.options.log.warn(
                    { err: error, fetchedAt: this.cached.fetchedAt },
                    "property catalogue refresh failed; serving the previous copy",
                );
                return this.cached;
            })
            .finally(() => (this.inflight = null));
        return this.inflight;
    }

    private async load(): Promise<Catalog> {
        const fetchedAt = new Date(this.now());
        const cards: PropertyCard[] = [];
        const projectData: Catalog["projectData"] = new Map();
        const { mediaBaseUrl } = this.options;
        const mapOptions = {
            dataAsOf: fetchedAt,
            mediaBaseUrl: mediaBaseUrl ? (slug: string | null) => (slug ? `${mediaBaseUrl}/${slug}` : null) : null,
        };

        for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES; page++) {
            // `include=details` adds amenities, payment plans, FAQs and loans to each project, so no
            // per-project detail calls are needed. An upstream without it simply leaves them out.
            const body = await this.getJson(`${this.options.apiBaseUrl}/projects?page=${page}&limit=${PAGE_LIMIT}&include=details`);
            const parsed = UpstreamProjectListResponseSchema.safeParse(body);
            if (!parsed.success || !parsed.data.success) {
                throw new Error(`Unexpected response from the projects API (page ${page})`);
            }
            pages = parsed.data.pagination?.pages ?? page;

            for (const raw of parsed.data.data) {
                const mapped = mapCatalogProject(raw, mapOptions);
                if (mapped.ok) {
                    cards.push(mapped.card);
                    const slug = mapped.card.slug;
                    const details = slug && hasDetails(raw) ? UpstreamProjectDetailSchema.safeParse(raw) : null;
                    if (slug && details?.success) {
                        this.extras.set(slug, { value: mapProjectExtras(details.data), expiresAt: this.now() + EXTRAS_TTL_MS });
                    }
                    if (!projectData.has(mapped.card.id)) {
                        projectData.set(mapped.card.id, {
                            gallery: mapped.gallery,
                            bookingAmountInr: mapped.bookingAmountInr,
                            areaText: mapped.areaText,
                        });
                    }
                } else this.options.log.warn({ projectId: mapped.id, reason: mapped.reason }, "skipped upstream project");
            }
        }
        return { cards: dedupeById(cards), projectData, fetchedAt };
    }

    private async getJson(url: string, timeoutMs = this.options.timeoutMs): Promise<unknown> {
        const response = await this.fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Projects API responded ${response.status}`);
        return response.json();
    }
}

/** Whether a list item carries the detail fields (`include=details`), rather than leaving them out. */
const hasDetails = (raw: unknown) =>
    typeof raw === "object" && raw !== null && ("amenities" in raw || "paymentPlan" in raw || "faqs" in raw);

function dedupeById(cards: PropertyCard[]): PropertyCard[] {
    const seen = new Set<string>();
    return cards.filter((c) => !seen.has(c.id) && seen.add(c.id));
}

/** Price of the configurations that match the requested BHK, else the project's overall price. */
function relevantPrice(card: PropertyCard, bedrooms: number | undefined): MoneyRange | null {
    if (bedrooms === undefined) return card.price;
    const prices = card.configurations
        .filter((c) => matchesBedrooms(c.bedrooms, bedrooms))
        .map((c) => c.price)
        .filter((p): p is MoneyRange => p !== null && (p.min !== null || p.max !== null));
    if (prices.length === 0) return card.price;
    const mins = prices.map((p) => p.min ?? p.max!);
    const maxes = prices.map((p) => p.max ?? p.min!);
    return { currency: "INR", min: Math.min(...mins), max: Math.max(...maxes), pricePerSqft: null };
}

/** "3 BHK" also matches 3.5 BHK units. */
const matchesBedrooms = (have: number | null, want: number) => have !== null && Math.floor(have) === want;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * How a project matches, if at all: "name" when every keyword is in its name,
 * developer, slug or code; otherwise "other" (e.g. `areaText`, which lets keywords
 * match a road, sector or landmark the project is near).
 */
function matchesQuery(
    card: PropertyCard,
    price: MoneyRange | null,
    query: PropertySearchQuery,
    areaText: string,
): "name" | "other" | null {
    if (query.bedrooms !== undefined && !card.configurations.some((c) => matchesBedrooms(c.bedrooms, query.bedrooms!))) {
        return null;
    }
    // A project fits a budget when some relevant unit could: its cheapest unit is
    // within the ceiling and its dearest is above the floor. Unknown prices never fit.
    if (query.budgetMaxInr !== undefined) {
        const low = price?.min ?? price?.max;
        if (low == null || low > query.budgetMaxInr) return null;
    }
    if (query.budgetMinInr !== undefined) {
        const high = price?.max ?? price?.min;
        if (high == null || high < query.budgetMinInr) return null;
    }
    if (query.category && normalize(card.category ?? "") !== normalize(query.category)) return null;
    if (query.localityId && card.location.localityId !== query.localityId) return null;
    if (query.excludeId && card.id === query.excludeId) return null;
    if (query.near) {
        const at = card.location.coordinates;
        if (!at || distanceKm(query.near, at) > (query.withinKm ?? DEFAULT_NEAR_KM)) return null;
    }
    if (query.text) {
        const words = normalize(query.text).split(" ").filter(Boolean);
        const has = (parts: Array<string | null | undefined>) => {
            const haystack = normalize(parts.filter(Boolean).join(" "));
            return words.every((w) => haystack.includes(w));
        };
        const identity = [card.name, card.developer?.name, card.slug, card.projectCode];
        if (has(identity)) return "name";
        if (!has([...identity, card.status, ...card.propertyTypes, ...card.highlights, areaText])) return null;
    }
    return "other";
}
