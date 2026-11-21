import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, safeText } from "./common.js";

/**
 * Where a card's data came from. `fixture` is fictional development data;
 * `catalog` is data mapped from the Property Desk projects API.
 */
export const PropertySourceSchema = z.enum(["fixture", "catalog"]);
export type PropertySource = z.infer<typeof PropertySourceSchema>;

export const MoneyRangeSchema = z.object({
    currency: z.literal("INR"),
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    pricePerSqft: z.number().nonnegative().nullable(),
});
export type MoneyRange = z.infer<typeof MoneyRangeSchema>;

/**
 * Upstream availability counters were all zero in the captured snapshot, so
 * zeros are treated as "not tracked" rather than "sold out". `reported_*`
 * values only reflect what the source reported at `dataAsOf`, never live stock.
 */
export const AvailabilitySchema = z.object({
    status: z.enum(["unknown", "reported_available", "reported_sold_out"]),
    availableUnits: z.number().int().nonnegative().nullable(),
});
export type Availability = z.infer<typeof AvailabilitySchema>;

export const PropertyConfigurationSchema = z.object({
    /** Human label, e.g. "3 BHK", "3.5 BHK", "Office". */
    label: safeText(40),
    /** Bedroom count when the label is a BHK configuration, otherwise null. */
    bedrooms: z.number().positive().max(20).nullable(),
    size: z
        .object({
            min: z.number().positive().nullable(),
            max: z.number().positive().nullable(),
            unit: safeText(16),
        })
        .nullable(),
    price: MoneyRangeSchema.nullable(),
    availability: AvailabilitySchema,
});
export type PropertyConfiguration = z.infer<typeof PropertyConfigurationSchema>;

export const CoordinatesSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const PropertyImageSchema = z.object({
    /** Absolute HTTPS URL when resolvable; null when only a relative path is known. */
    url: z.url({ protocol: /^https$/ }).nullable(),
    /** Path or filename as provided by the source. */
    path: safeText(512),
    alt: safeText(200),
});
export type PropertyImage = z.infer<typeof PropertyImageSchema>;

/** How the source files a project photo. */
export const GalleryCategorySchema = z.enum(["exterior", "interior", "floor_plan", "master_plan", "site_plan", "location"]);
export type GalleryCategory = z.infer<typeof GalleryCategorySchema>;

/** A project photo or plan. Unlike a card image, it always has a URL: images that cannot be shown are left out. */
export const GalleryImageSchema = PropertyImageSchema.extend({
    url: z.url({ protocol: /^https$/ }),
    category: GalleryCategorySchema,
});
export type GalleryImage = z.infer<typeof GalleryImageSchema>;

export const PropertyCardSchema = z.object({
    /** Source identifier (Property Desk `_id`) — preserved verbatim. */
    id: safeText(64),
    source: PropertySourceSchema,
    projectCode: safeText(64).nullable(),
    slug: safeText(200).nullable(),
    name: safeText(200),
    developer: z
        .object({
            id: safeText(64).nullable(),
            name: safeText(200),
            slug: safeText(200).nullable(),
        })
        .nullable(),
    location: z.object({
        /** Display name of the locality, null if the source only gave an opaque id. */
        localityName: safeText(120).nullable(),
        /** Opaque source locality id, kept for later resolution. */
        localityId: safeText(64).nullable(),
        city: safeText(120).nullable(),
        pincode: safeText(12).nullable(),
        /** Map position; null when the source gives none or an implausible one. Older stored cards omit it. */
        coordinates: CoordinatesSchema.nullable().default(null),
    }),
    category: safeText(60).nullable(),
    propertyTypes: z.array(safeText(60)).max(20),
    /** Launch/marketing status as labelled by the source, e.g. "Pre-Launch". */
    status: safeText(60).nullable(),
    price: MoneyRangeSchema.nullable(),
    configurations: z.array(PropertyConfigurationSchema).max(30),
    possessionDate: IsoDateSchema.nullable(),
    reraId: safeText(120).nullable(),
    highlights: z.array(safeText(300)).max(6),
    /** Amenity names, highlighted ones first. Empty when unknown; cards stored before this field existed omit it. */
    amenities: z.array(safeText(60)).max(30).default([]),
    image: PropertyImageSchema.nullable(),
    /** Exterior and interior photos for the card's carousel; cards stored before this field existed omit it. */
    photos: z.array(GalleryImageSchema).max(8).default([]),
    detailUrl: z.url({ protocol: /^https$/ }).nullable(),
    /** When the underlying data was captured/fetched; null if unknown. */
    dataAsOf: IsoDateTimeSchema.nullable(),
});
export type PropertyCard = z.infer<typeof PropertyCardSchema>;
