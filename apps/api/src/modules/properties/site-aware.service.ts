import { AsyncLocalStorage } from "node:async_hooks";
import type { PropertyCard } from "@property-assistant/contracts";
import type { PropertyGallery, PropertySearchQuery, PropertySearchResult, PropertyService } from "./property.service.js";

/** The website the current request came from (an allowed origin), for the rest of its async work. */
const site = new AsyncLocalStorage<string>();

/** Runs `fn` (and everything it starts, such as a streamed reply) on behalf of `origin`. */
export function runForSite<T>(origin: string, fn: () => T): T {
    return site.run(origin, fn);
}

/**
 * Projects come from whichever allowed website the widget is open on: a request from
 * https://example.com reads https://example.com/api/projects, so the cards' ids are the ones
 * that site knows (its share and enquiry endpoints accept them). Requests from anywhere else
 * (tests, the dev UI, server calls) use the default source. One service per site keeps its
 * own catalogue cache.
 */
export class SiteAwarePropertyService implements PropertyService {
    private readonly perSite = new Map<string, PropertyService>();

    constructor(
        private readonly fallback: PropertyService,
        private readonly forSite: (origin: string) => PropertyService,
    ) {}

    private current(): PropertyService {
        const origin = site.getStore();
        if (!origin) return this.fallback;
        let service = this.perSite.get(origin);
        if (!service) {
            service = this.forSite(origin);
            this.perSite.set(origin, service);
        }
        return service;
    }

    search(query: PropertySearchQuery): Promise<PropertySearchResult> {
        return this.current().search(query);
    }
    getByIds(ids: readonly string[]): Promise<PropertySearchResult> {
        return this.current().getByIds(ids);
    }
    getGallery(id: string): Promise<PropertyGallery | null> {
        return this.current().getGallery(id);
    }
    getDetails(id: string): ReturnType<PropertyService["getDetails"]> {
        return this.current().getDetails(id);
    }
    suggest(text: string, limit: number): ReturnType<PropertyService["suggest"]> {
        return this.current().suggest(text, limit);
    }
    getBySlug(slug: string): Promise<PropertyCard | null> {
        return this.current().getBySlug(slug);
    }
}
