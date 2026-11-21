import { distanceKm, type PropertyCard } from "@property-assistant/contracts";
import {
    DEMO_PROJECTS,
    type NameSuggestion,
    type PropertyDetails,
    type PropertyGallery,
} from "@property-assistant/llm";
import { suggestNames } from "./name-suggestions.js";
import type { PropertySearchQuery, PropertySearchResult, PropertyService } from "./property.service.js";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 100;
const normalize = (value: string) =>
    value.toLowerCase().replace(/\bext\.?\b/g, "extension").replace(/\brd\.?\b/g, "road").replace(/[^a-z0-9]+/g, " ").trim();

function projectForId(id: string) {
    return DEMO_PROJECTS.find(({ card }) => card.id === id || card.slug === id) ?? null;
}

function projectMatches(project: (typeof DEMO_PROJECTS)[number], query: PropertySearchQuery): boolean {
    const { card } = project;
    if (query.excludeId && (card.id === query.excludeId || card.slug === query.excludeId)) return false;
    if (query.category && card.category?.toLowerCase() !== query.category.toLowerCase()) return false;
    if (query.localityId && card.location.localityId !== query.localityId) return false;
    if (query.bedrooms !== undefined && !card.configurations.some((configuration) => configuration.bedrooms === query.bedrooms)) {
        return false;
    }

    const configuration = query.bedrooms
        ? card.configurations.find((item) => item.bedrooms === query.bedrooms)
        : undefined;
    const price = configuration?.price ?? card.price;
    if (query.budgetMinInr !== undefined && (price?.max ?? price?.min ?? 0) < query.budgetMinInr) return false;
    if (query.budgetMaxInr !== undefined && (price?.min ?? price?.max ?? Number.POSITIVE_INFINITY) > query.budgetMaxInr) return false;

    if (query.text) {
        const searchable = normalize(
            [
                card.name,
                card.developer?.name,
                card.slug,
                card.status,
                card.category,
                card.location.localityName,
                card.location.city,
                ...card.propertyTypes,
                ...card.configurations.map((item) => item.label),
                ...card.highlights,
                ...project.aliases,
                ...project.locationAdvantages,
            ]
                .filter(Boolean)
                .join(" "),
        );
        if (!normalize(query.text).split(" ").every((word) => searchable.includes(word))) return false;
    }

    if (query.near) {
        if (!card.location.coordinates) return false;
        if (distanceKm(query.near, card.location.coordinates) > (query.withinKm ?? 5)) return false;
    }
    return true;
}

export class FixturePropertyService implements PropertyService {
    async search(query: PropertySearchQuery): Promise<PropertySearchResult> {
        const matches = DEMO_PROJECTS.filter((project) => projectMatches(project, query));
        if (query.near) {
            matches.sort((a, b) => distanceKm(query.near!, a.card.location.coordinates!) - distanceKm(query.near!, b.card.location.coordinates!));
        } else if (query.budgetMaxInr !== undefined) {
            matches.sort((a, b) => (b.card.price?.min ?? 0) - (a.card.price?.min ?? 0));
        }
        const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
        const start = (Math.max(query.page ?? 1, 1) - 1) * limit;
        return {
            items: matches.slice(start, start + limit).map(({ card }) => card),
            total: matches.length,
            fetchedAt: new Date().toISOString(),
        };
    }

    async getByIds(ids: readonly string[]): Promise<PropertySearchResult> {
        const items = [...new Map(ids.flatMap((id) => {
            const project = projectForId(id);
            return project ? [[project.card.id, project.card] as const] : [];
        })).values()];
        return { items, total: items.length, fetchedAt: new Date().toISOString() };
    }

    async getGallery(id: string): Promise<PropertyGallery | null> {
        const project = projectForId(id);
        return project ? { card: project.card, images: project.gallery } : null;
    }

    async getDetails(id: string): Promise<PropertyDetails | null> {
        const project = projectForId(id);
        if (!project) return null;
        return {
            card: project.card,
            bookingAmountInr: project.bookingAmountInr,
            amenities: project.card.amenities,
            paymentPlan: project.paymentPlan,
            loanBanks: project.loanBanks,
            faqs: [],
            nearby: project.nearby,
            locationAdvantages: project.locationAdvantages,
        };
    }

    async suggest(text: string, limit: number): Promise<NameSuggestion[]> {
        const query = normalize(text);
        const hasMatch = DEMO_PROJECTS.some((project) => projectMatches(project, { text: query }));
        if (hasMatch) return [];
        return suggestNames(
            text,
            DEMO_PROJECTS.map(({ card }) => ({ id: card.id, name: card.name, developer: card.developer?.name ?? null })),
            limit,
        );
    }

    async getBySlug(slug: string): Promise<PropertyCard | null> {
        return projectForId(slug)?.card ?? null;
    }
}
