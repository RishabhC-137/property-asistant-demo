import {
    PropertyCardSchema,
    type Availability,
    type Coordinates,
    type GalleryCategory,
    type GalleryImage,
    type MoneyRange,
    type PropertyCard,
    type PropertyConfiguration,
    type PropertyImage,
} from "@property-assistant/contracts";
import type { NearbyPlace, PaymentStage, ProjectExtras } from "@property-assistant/llm";
import {
    UpstreamAmenitySchema,
    UpstreamFaqSchema,
    UpstreamNearbySchema,
    UpstreamPaymentStageSchema,
    UpstreamProjectSchema,
    type UpstreamProject,
    type UpstreamProjectDetailResponseSchema,
} from "./catalog.schema.js";
import type { z } from "zod";

/**
 * Maps a raw Property Desk project into a public `PropertyCard`.
 *
 * Rules, based on the captured snapshot:
 *  - `displayName` is often "" → fall back to `name`, then `projectCode`.
 *  - `location.address.locality` is an opaque 24-hex id → exposed as
 *    `localityId`; `localityName` only when resolvable via `localityNames`.
 *  - images are bare filenames → `url` is null unless `mediaBaseUrl` is set.
 *  - all-zero availability counters mean "not tracked" → `unknown`.
 *  - dates are IST midnight stored as UTC (`…T18:30:00.000Z`) → IST date.
 *  - highlights are HTML → plain text.
 *  - workflow/publish/audit fields are never copied (fields are picked explicitly).
 */
export interface MapOptions {
    /**
     * HTTPS base for relative media filenames, or a function of the project
     * slug (upstream stores images per project folder). Default null.
     */
    mediaBaseUrl?: string | ((slug: string | null) => string | null) | null;
    /** Optional resolution of opaque locality ids to display names. */
    localityNames?: ReadonlyMap<string, string>;
    /** When the upstream data was fetched/captured. */
    dataAsOf?: Date | null;
}

export type MapResult =
    | {
          ok: true;
          card: PropertyCard;
          gallery: GalleryImage[];
          bookingAmountInr: number | null;
          /** Location advantages as plain text ("2 min from Sohna Road…"), so searches can match an area. */
          areaText: string;
      }
    | { ok: false; id: string | null; reason: string };

const OPAQUE_ID = /^[a-f0-9]{24}$/i;
const TRUSTED_DETAIL_HOST = /(^|\.)example\.com$/i;

export function cleanText(value: string | null | undefined, max: number): string | null {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
    if (cleaned === "") return null;
    return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        if (entity[0] === "#") {
            const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
        }
        return ENTITIES[entity.toLowerCase()] ?? match;
    });
}

/** Converts upstream highlight HTML into short plain-text bullet strings. */
export function htmlToHighlights(html: readonly string[] | null | undefined, maxItems = 6): string[] {
    if (!html) return [];
    const lines = html
        .join("\n")
        .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
        .replace(/<\s*(br|\/?li|\/p|\/div|\/h[1-6])\b[^>]*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .split("\n")
        .map((line) => cleanText(decodeEntities(line), 300))
        .filter((line): line is string => line !== null);
    return [...new Set(lines)].slice(0, maxItems);
}

/** Converts an upstream timestamp to an Asia/Kolkata calendar date. */
export function toIstDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function httpsUrl(value: string): URL | null {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

/**
 * Resolves an upstream media reference. Absolute HTTPS URLs are kept; bare
 * relative paths are joined to `mediaBaseUrl` when configured. Anything else
 * (other schemes, traversal, odd characters) is rejected.
 */
export function resolveMedia(path: string | null | undefined, alt: string, mediaBaseUrl?: string | null): PropertyImage | null {
    const raw = cleanText(path, 512);
    if (!raw) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        const url = httpsUrl(raw);
        return url ? { url: url.href, path: raw, alt } : null;
    }
    if (!/^\/?[A-Za-z0-9._~\-/]+$/.test(raw) || raw.split("/").includes("..")) return null;
    const base = mediaBaseUrl ? httpsUrl(mediaBaseUrl.endsWith("/") ? mediaBaseUrl : `${mediaBaseUrl}/`) : null;
    return { url: base ? new URL(raw.replace(/^\/+/, ""), base).href : null, path: raw, alt };
}

function nonNegative(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** No home or office lists below ₹1 lakh; smaller amounts are data-entry errors (e.g. 15.56 meant as crore). */
const MIN_PLAUSIBLE_PRICE_INR = 100_000;

const plausiblePrice = (value: number | null | undefined) => {
    const amount = nonNegative(value);
    return amount !== null && amount >= MIN_PLAUSIBLE_PRICE_INR ? amount : null;
};

function money(price: UpstreamProject["pricing"]): MoneyRange | null {
    if (!price || (price.currency ?? "INR").toUpperCase() !== "INR") return null;
    const min = plausiblePrice(price.minAmount);
    let max = plausiblePrice(price.maxAmount);
    if (min !== null && max !== null && max < min) max = null;
    const perSqft = price.priceUnit === "per_sqft" ? nonNegative(price.pricePerSqft) : null;
    if (min === null && max === null && perSqft === null) return null;
    return { currency: "INR", min, max, pricePerSqft: perSqft };
}

function configLabel(type: string | null | undefined): { label: string; bedrooms: number | null } | null {
    const raw = cleanText(type, 40);
    if (!raw) return null;
    const bhk = /^(\d+(?:\.5)?)\s*BHK$/i.exec(raw);
    if (bhk) {
        const bedrooms = Number(bhk[1]);
        return { label: `${bedrooms} BHK`, bedrooms };
    }
    return { label: raw, bedrooms: null };
}

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const maxOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/**
 * Groups variants with the same label and size unit (upstream lists e.g.
 * two "3BHK" rows with different sizes) into one range.
 */
function configurations(raw: UpstreamProject["bhkConfigurations"]): PropertyConfiguration[] {
    const groups = new Map<string, PropertyConfiguration & { tracked: boolean; units: number }>();
    for (const variant of raw ?? []) {
        const label = configLabel(variant.type);
        if (!label) continue;
        const unit = cleanText(variant.size?.unit, 16);
        const sizeMin = nonNegative(variant.size?.min) || null;
        const sizeMax = nonNegative(variant.size?.max) || null;
        const price = money(variant.price);
        const total = nonNegative(variant.availability?.total) ?? 0;
        const available = nonNegative(variant.availability?.available) ?? 0;
        const key = `${label.label}|${unit ?? ""}`;

        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                ...label,
                size: unit && (sizeMin || sizeMax) ? { min: sizeMin, max: sizeMax, unit } : null,
                price,
                availability: { status: "unknown", availableUnits: null },
                tracked: total > 0,
                units: total > 0 ? available : 0,
            });
            continue;
        }
        if (existing.size && unit) {
            existing.size.min = minOf(existing.size.min, sizeMin);
            existing.size.max = maxOf(existing.size.max ?? existing.size.min, sizeMax ?? sizeMin);
        }
        if (price) {
            existing.price = existing.price
                ? {
                      currency: "INR",
                      min: minOf(existing.price.min, price.min),
                      max: maxOf(existing.price.max ?? existing.price.min, price.max ?? price.min),
                      pricePerSqft: existing.price.pricePerSqft ?? price.pricePerSqft,
                  }
                : price;
        }
        if (total > 0) {
            existing.tracked = true;
            existing.units += available;
        }
    }
    return [...groups.values()].map(({ tracked, units, ...config }) => {
        const availability: Availability = !tracked
            ? { status: "unknown", availableUnits: null }
            : units > 0
              ? { status: "reported_available", availableUnits: units }
              : { status: "reported_sold_out", availableUnits: 0 };
        return { ...config, availability };
    });
}

/**
 * The project's price range, widened to cover every configuration's price.
 * Upstream's project-level range sometimes disagrees with its own
 * configurations (e.g. ₹1.70–2.30 Cr with a 2 BHK from ₹1.40 Cr).
 */
function projectPrice(pricing: UpstreamProject["pricing"], configs: readonly PropertyConfiguration[]): MoneyRange | null {
    const base = money(pricing);
    let min = base?.min ?? null;
    let max = base?.max ?? null;
    for (const { price } of configs) {
        if (!price) continue;
        min = minOf(min, price.min);
        max = maxOf(max, price.max ?? price.min);
    }
    if (min === null && max === null) return base;
    return { currency: "INR", min, max, pricePerSqft: base?.pricePerSqft ?? null };
}

function detailUrl(canonical: string | null | undefined): string | null {
    const url = canonical ? httpsUrl(canonical) : null;
    return url && TRUSTED_DETAIL_HOST.test(url.hostname) ? url.href : null;
}

type UpstreamDetail = NonNullable<z.infer<typeof UpstreamProjectDetailResponseSchema>["data"]>;

const parseEach = <T>(schema: z.ZodType<T>, items: readonly unknown[] | null | undefined): T[] =>
    (items ?? []).flatMap((item) => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
    });

/** HTML (or plain text) from the source as one plain-text paragraph. */
const htmlToText = (html: string | null | undefined, max: number) => cleanText(htmlToHighlights(html ? [html] : [], 20).join(" "), max);

const NEARBY_KINDS: ReadonlyArray<[string, string]> = [
    ["metro", "Metro"],
    ["airport", "Airport"],
    ["railway", "Railway station"],
    ["highways", "Highway"],
    ["schools", "School"],
    ["hospitals", "Hospital"],
    ["malls", "Mall"],
    ["offices", "Office hub"],
];
const NEARBY_PER_KIND = 3;

/** An entry the site marks as still awaiting approval: never shown or quoted. */
const awaitingApproval = (entry: unknown) => typeof entry === "object" && entry !== null && "pendingRequestId" in entry && !!(entry as { pendingRequestId?: unknown }).pendingRequestId;

function paymentPlan(raw: readonly unknown[] | null | undefined): PaymentStage[] {
    return parseEach(UpstreamPaymentStageSchema, (raw ?? []).filter((s) => !awaitingApproval(s)))
        .flatMap((s) => {
            const stage = cleanText(s.stage, 200);
            const percentage = s.percentage;
            if (!stage || typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return [];
            return [{ stage, percentage, note: cleanText(s.timeline, 200) }];
        })
        .slice(0, 20);
}

/** Approved bank names, whether the source lists them as strings or as objects. */
function loanBanks(raw: readonly unknown[] | null | undefined): string[] {
    const names = (raw ?? []).filter((bank) => !awaitingApproval(bank)).map((bank) => {
        if (typeof bank === "string") return cleanText(bank, 100);
        const named = bank as { name?: unknown; bankName?: unknown } | null;
        const name = typeof named?.name === "string" ? named.name : typeof named?.bankName === "string" ? named.bankName : null;
        return cleanText(name, 100);
    });
    return [...new Set(names.filter((n): n is string => n !== null))].slice(0, 20);
}

function nearby(raw: Record<string, unknown> | null | undefined): NearbyPlace[] {
    return NEARBY_KINDS.flatMap(([key, kind]) => {
        const items = Array.isArray(raw?.[key]) ? (raw[key] as unknown[]) : [];
        return parseEach(UpstreamNearbySchema, items)
            .flatMap((p) => {
                const name = cleanText(p.name, 120);
                return name ? [{ kind, name, distance: cleanText(p.distance, 40), travelTime: cleanText(p.travelTime, 40) }] : [];
            })
            .slice(0, NEARBY_PER_KIND);
    });
}

/**
 * Customer-facing facts from a project detail response: amenities, payment
 * plan, approved banks, FAQs, nearby places and location advantages. Each
 * field is picked explicitly, so internal fields can never pass through.
 */
export function mapProjectExtras(data: UpstreamDetail | null | undefined): ProjectExtras {
    return {
        amenities: mapAmenities(data?.amenities),
        paymentPlan: paymentPlan(data?.paymentPlan),
        loanBanks: loanBanks(data?.loanApproved),
        faqs: parseEach(UpstreamFaqSchema, data?.faqs)
            .filter((f) => f.isActive !== false)
            .flatMap((f) => {
                const question = cleanText(f.question, 200);
                const answer = htmlToText(f.answer, 600);
                return question && answer ? [{ question, answer }] : [];
            })
            .slice(0, 10),
        nearby: nearby(data?.connectivity),
        locationAdvantages: htmlToHighlights(data?.locationAdvantage, 6),
    };
}

/** Metro City district and its edges; a point outside this is a data error, not a project. */
const AREA = { latMin: 28.1, latMax: 28.75, lngMin: 76.6, lngMax: 77.35 };
const inArea = (lat: number, lng: number) => lat >= AREA.latMin && lat <= AREA.latMax && lng >= AREA.lngMin && lng <= AREA.lngMax;

/**
 * A project's map position. Upstream should store GeoJSON [lng, lat], but
 * over half its projects have the pair swapped; either order is accepted when
 * it lands in the Metro City area, and anything else (0,0, another state) is dropped.
 */
export function mapCoordinates(raw: readonly number[] | null | undefined): Coordinates | null {
    if (!raw || raw.length !== 2 || !raw.every((n) => Number.isFinite(n))) return null;
    const [first, second] = raw as [number, number];
    if (inArea(second, first)) return { lat: second, lng: first };
    if (inArea(first, second)) return { lat: first, lng: second };
    return null;
}

/** Upstream media folders, in the order the gallery shows them. */
type MediaFolder = "exterior" | "interior" | "floorPlans" | "masterPlan" | "sitePlan" | "siteMap" | "location";
const GALLERY_FOLDERS: ReadonlyArray<[MediaFolder, GalleryCategory]> = [
    ["exterior", "exterior"],
    ["interior", "interior"],
    ["floorPlans", "floor_plan"],
    ["masterPlan", "master_plan"],
    ["sitePlan", "site_plan"],
    ["siteMap", "site_plan"],
    ["location", "location"],
];
const MAX_GALLERY_IMAGES = 40;
const CARD_PHOTOS = 8;

const CATEGORY_WORDS: Record<GalleryCategory, string> = {
    exterior: "exterior",
    interior: "interior",
    floor_plan: "floor plan",
    master_plan: "master plan",
    site_plan: "site plan",
    location: "location map",
};

/**
 * A caption from the file name, which upstream writes as words plus an upload
 * suffix ("antalya-hills-grand-entrance-196752.webp" → "Antalya hills grand
 * entrance"); a generic caption when the name has no words.
 */
export function captionFromFilename(path: string, projectName: string, category: GalleryCategory): string {
    const words = (path.split("/").at(-1) ?? "")
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]\d{3,}$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
    // Words from the project name keep its spelling ("m3m antalya hills" → "M3M Antalya Hills").
    const proper = new Map(projectName.split(/\s+/).map((w) => [w.toLowerCase(), w]));
    const cased = words
        .split(" ")
        .map((w) => proper.get(w.toLowerCase()) ?? w)
        .join(" ");
    const caption = /[a-z]{3,}/i.test(cased) ? cased.charAt(0).toUpperCase() + cased.slice(1) : null;
    return cleanText(caption ?? `${projectName} ${CATEGORY_WORDS[category]}`, 200) ?? projectName;
}

/** Every project photo and plan that resolves to a URL, by category, without duplicates. */
function mapGallery(images: NonNullable<UpstreamProject["media"]>["images"], name: string, mediaBaseUrl: string | null): GalleryImage[] {
    const seen = new Set<string>();
    const gallery: GalleryImage[] = [];
    for (const [folder, category] of GALLERY_FOLDERS) {
        for (const path of images?.[folder] ?? []) {
            // Location maps are filed under site or master plans upstream; their file names say what they are.
            const kind = /location|route-map|connectivity/i.test(path) ? "location" : category;
            const image = resolveMedia(path, captionFromFilename(path, name, kind), mediaBaseUrl);
            if (!image?.url || seen.has(image.url)) continue;
            seen.add(image.url);
            gallery.push({ ...image, url: image.url, category: kind });
        }
    }
    return gallery.slice(0, MAX_GALLERY_IMAGES);
}

/** Amenity names from a project detail response: highlighted first, cleaned, deduplicated, capped. */
export function mapAmenities(raw: readonly unknown[] | null | undefined, max = 30): string[] {
    const amenities = (raw ?? [])
        .map((a) => UpstreamAmenitySchema.safeParse(a))
        .flatMap((r) => (r.success ? [r.data] : []))
        .map((a) => ({ name: cleanText(a.name, 60), highlight: a.isHighlight === true }))
        .filter((a): a is { name: string; highlight: boolean } => a.name !== null)
        .sort((a, b) => Number(b.highlight) - Number(a.highlight));
    return [...new Set(amenities.map((a) => a.name))].slice(0, max);
}

export function mapCatalogProject(raw: unknown, options: MapOptions = {}): MapResult {
    const parsed = UpstreamProjectSchema.safeParse(raw);
    if (!parsed.success) {
        const id = typeof (raw as { _id?: unknown })?._id === "string" ? (raw as { _id: string })._id : null;
        return { ok: false, id, reason: "unrecognised project shape" };
    }
    const p = parsed.data;

    const name = cleanText(p.displayName, 200) ?? cleanText(p.name, 200) ?? cleanText(p.projectCode, 200);
    if (!name) return { ok: false, id: p._id, reason: "project has no usable name" };

    const rawLocality = cleanText(p.location?.address?.locality, 120);
    const localityIsOpaque = rawLocality !== null && OPAQUE_ID.test(rawLocality);
    const developerName = cleanText(p.developer?.name, 200);
    const exterior = p.media?.images?.exterior?.[0] ?? p.media?.images?.interior?.[0];
    const slug = cleanText(p.seo?.slug, 200);
    const configs = configurations(p.bhkConfigurations).slice(0, 30);
    const mediaBaseUrl =
        typeof options.mediaBaseUrl === "function" ? options.mediaBaseUrl(slug) : options.mediaBaseUrl;

    const card: PropertyCard = {
        id: p._id,
        source: "catalog",
        projectCode: cleanText(p.projectCode, 64),
        slug,
        name,
        developer: developerName
            ? {
                  id: cleanText(p.developer?.developerId ?? p.developer?.id, 64),
                  name: developerName,
                  slug: cleanText(p.developer?.slug, 200),
              }
            : null,
        location: {
            localityName: localityIsOpaque
                ? cleanText(options.localityNames?.get(rawLocality!), 120)
                : rawLocality,
            localityId: localityIsOpaque ? rawLocality : null,
            city: cleanText(p.location?.address?.city, 120),
            pincode: cleanText(p.location?.address?.pincode, 12),
            coordinates: mapCoordinates(p.location?.coordinates),
        },
        category: cleanText(p.propertyCategory, 60),
        propertyTypes: (p.propertyType ?? [])
            .map((t) => cleanText(t, 60))
            .filter((t): t is string => t !== null)
            .slice(0, 20),
        status: cleanText(p.status, 60),
        price: projectPrice(p.pricing, configs),
        configurations: configs,
        possessionDate: toIstDate(p.possessionDate),
        reraId: cleanText(p.reraId, 120),
        highlights: htmlToHighlights(p.keyHighlights),
        // Only the detail endpoint lists amenities; the service fills them in for cards it returns.
        amenities: [],
        image: resolveMedia(exterior, `${name} exterior`, mediaBaseUrl),
        photos: [],
        detailUrl: detailUrl(p.seo?.canonicalUrl),
        dataAsOf: options.dataAsOf ? options.dataAsOf.toISOString() : null,
    };

    // Final guard: the public contract must hold for anything we emit.
    const checked = PropertyCardSchema.safeParse(card);
    if (!checked.success) return { ok: false, id: p._id, reason: checked.error.issues[0]?.message ?? "invalid card" };
    const gallery = mapGallery(p.media?.images, name, mediaBaseUrl ?? null);
    return {
        ok: true,
        // Photos only (plans and maps belong in the gallery), a handful for swiping through on the card.
        card: { ...checked.data, photos: gallery.filter((i) => i.category === "exterior" || i.category === "interior").slice(0, CARD_PHOTOS) },
        gallery,
        bookingAmountInr: plausiblePrice(p.pricing?.bookingAmount),
        areaText: htmlToHighlights(p.locationAdvantage, 20).join(" "),
    };
}
