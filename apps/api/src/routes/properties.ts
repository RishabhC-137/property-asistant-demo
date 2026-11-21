import { PropertySearchParamsSchema, type PropertyPage } from "@property-assistant/contracts";
import type { PropertySearchQuery } from "@property-assistant/llm";
import type { FastifyInstance } from "fastify";
import { AppError, parseInput } from "../lib/errors.js";
import type { PropertyService } from "../modules/properties/property.service.js";

export interface PropertyRoutesOptions {
    properties: PropertyService;
}

const DEFAULT_LIMIT = 6;
const DEFAULT_NEAR_KM = 5;

/** Listing data only: the same public project data the cards already show. */
export async function propertyRoutes(app: FastifyInstance, options: PropertyRoutesOptions) {
    const { properties } = options;

    /** More results for a row of cards: its `query`, one page at a time. */
    app.get("/api/v1/properties", async (request): Promise<PropertyPage> => {
        const params = parseInput(PropertySearchParamsSchema, request.query, "query");
        const page = params.page ?? 1;
        const limit = params.limit ?? DEFAULT_LIMIT;
        const query: PropertySearchQuery = {
            ...(params.keywords ? { text: params.keywords } : {}),
            ...(params.bedrooms ? { bedrooms: params.bedrooms } : {}),
            ...(params.budgetMinInr !== undefined ? { budgetMinInr: params.budgetMinInr } : {}),
            ...(params.budgetMaxInr !== undefined ? { budgetMaxInr: params.budgetMaxInr } : {}),
            ...(params.category ? { category: params.category } : {}),
            page,
            limit,
        };
        if (params.nearProjectId) {
            const at = (await properties.getByIds([params.nearProjectId])).items[0]?.location.coordinates;
            if (!at) throw new AppError(404, "NOT_FOUND", "That project is unknown or has no map position");
            Object.assign(query, { near: at, withinKm: params.withinKm ?? DEFAULT_NEAR_KM, excludeId: params.nearProjectId });
        }

        let result;
        try {
            result = await properties.search(query);
        } catch (error) {
            request.log.warn({ err: error }, "property search failed");
            throw new AppError(503, "SERVICE_UNAVAILABLE", "Listings are unavailable right now. Please try again.", {
                retryable: true,
            });
        }
        const hasMore = result.total === null ? result.items.length === limit : page * limit < result.total;
        return { data: result.items, pagination: { page, limit, total: result.total, hasMore } };
    });
}
