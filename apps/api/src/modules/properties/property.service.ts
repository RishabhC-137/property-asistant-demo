import type { PropertyCard } from "@property-assistant/contracts";
import type { PropertyLookup } from "@property-assistant/llm";

export type { PropertyGallery, PropertySearchQuery, PropertySearchResult } from "@property-assistant/llm";

/**
 * Seam for property data. Routes and chat providers depend on this interface,
 * never on Property Desk directly. The live implementation is
 * `CatalogPropertyService` (see docs/catalog-upstream.md).
 * It extends the lookup the LLM tools need.
 */
export interface PropertyService extends PropertyLookup {
    getBySlug(slug: string): Promise<PropertyCard | null>;
}
