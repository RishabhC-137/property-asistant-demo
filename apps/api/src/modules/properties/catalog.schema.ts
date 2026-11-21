import { z } from "zod";

/**
 * Lenient shape of a Property Desk project, derived from captured responses
 * of `GET /api/projects?page=&limit=` (Postman snapshot). Everything is
 * optional/nullable because upstream data is inconsistent; unknown fields are
 * tolerated but never forwarded — the mapper picks fields explicitly.
 *
 * Reference only: nothing in this service calls the upstream API yet.
 */
const str = z.string().nullish();
const num = z.number().nullish();
const strArray = z.array(z.string()).nullish();

const UpstreamPriceSchema = z.looseObject({
    currency: str,
    minAmount: num,
    maxAmount: num,
    pricePerSqft: num,
    priceUnit: str,
    bookingAmount: num,
});

export const UpstreamBhkConfigurationSchema = z.looseObject({
    type: str,
    price: UpstreamPriceSchema.nullish(),
    size: z.looseObject({ min: num, max: num, unit: str }).nullish(),
    availability: z.looseObject({ total: num, sold: num, blocked: num, available: num }).nullish(),
    images: strArray,
});

export const UpstreamProjectSchema = z.looseObject({
    _id: z.string().min(1),
    name: str,
    displayName: str,
    projectCode: str,
    seo: z.looseObject({ slug: str, canonicalUrl: str }).nullish(),
    location: z
        .looseObject({
            address: z.looseObject({ locality: str, city: str, pincode: str }).nullish(),
            /** GeoJSON order is [lng, lat], but upstream often stores [lat, lng]. */
            coordinates: z.array(z.number()).nullish(),
        })
        .nullish(),
    pricing: UpstreamPriceSchema.nullish(),
    propertyCategory: str,
    propertyType: strArray,
    bhkConfigurations: z.array(UpstreamBhkConfigurationSchema).nullish(),
    status: str,
    developer: z.looseObject({ id: str, developerId: str, name: str, slug: str }).nullish(),
    media: z
        .looseObject({
            images: z
                .looseObject({
                    exterior: strArray,
                    interior: strArray,
                    floorPlans: strArray,
                    masterPlan: strArray,
                    sitePlan: strArray,
                    siteMap: strArray,
                    location: strArray,
                })
                .nullish(),
        })
        .nullish(),
    possessionDate: str,
    reraId: str,
    keyHighlights: strArray,
    /** HTML list of nearby roads, sectors and landmarks. */
    locationAdvantage: strArray,
});
export type UpstreamProject = z.infer<typeof UpstreamProjectSchema>;

/** `GET /api/projects` envelope. Items are validated one by one by the mapper. */
export const UpstreamProjectListResponseSchema = z.looseObject({
    success: z.boolean(),
    data: z.array(z.unknown()),
    pagination: z
        .looseObject({ page: num, limit: num, total: num, pages: num })
        .nullish(),
});

/** One amenity on the project detail response. Only `name` and `isHighlight` are used. */
export const UpstreamAmenitySchema = z.looseObject({
    name: str,
    isHighlight: z.boolean().nullish(),
});

export const UpstreamPaymentStageSchema = z.looseObject({ stage: str, percentage: num, timeline: str });
export const UpstreamFaqSchema = z.looseObject({ question: str, answer: str, isActive: z.boolean().nullish() });
export const UpstreamNearbySchema = z.looseObject({ name: str, distance: str, travelTime: str });

/**
 * `GET /api/projects/:slug` envelope. Only the customer-facing fields below
 * are read: the detail response also carries internal fields (sales team,
 * audit log, lead source, analytics, competitors) that must never be exposed.
 * Items are validated one by one by the mapper.
 */
export const UpstreamProjectDetailSchema = z.looseObject({
    amenities: z.array(z.unknown()).nullish(),
    paymentPlan: z.array(z.unknown()).nullish(),
    loanApproved: z.array(z.unknown()).nullish(),
    faqs: z.array(z.unknown()).nullish(),
    connectivity: z.record(z.string(), z.unknown()).nullish(),
    locationAdvantage: strArray,
});

export const UpstreamProjectDetailResponseSchema = z.looseObject({
    success: z.boolean(),
    data: UpstreamProjectDetailSchema.nullish(),
    relatedProjects: z.array(z.unknown()).nullish(),
    builderProjects: z.array(z.unknown()).nullish(),
});
