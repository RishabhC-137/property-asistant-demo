import type { GalleryImage } from "@property-assistant/contracts";
import type { DemoProjectCase } from "./types.js";

const gallery: GalleryImage[] = [
    {
        url: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/garden-home",
        alt: "Low-rise home opening onto a landscaped garden",
        category: "exterior",
    },
    {
        url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/courtyard-living-room",
        alt: "Living space with natural finishes and garden views",
        category: "interior",
    },
    {
        url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/open-plan-interior",
        alt: "Open-plan living and dining space",
        category: "interior",
    },
];

const cover = gallery[0]!;

export const CEDAR_COURTYARDS = {
    aliases: ["cedar", "courtyards", "villa", "villas", "sector 33"],
    card: {
        id: "fixture-0003",
        source: "fixture",
        projectCode: "DEMO-CC-03",
        slug: "cedar-courtyards",
        name: "Cedar Courtyards",
        developer: { id: null, name: "Juniper Homes", slug: null },
        location: {
            localityName: "Sector 33, Sohna",
            localityId: null,
            city: "Gurugram",
            pincode: "122103",
            coordinates: { lat: 28.2474, lng: 77.0647 },
        },
        category: "Residential",
        propertyTypes: ["Villa"],
        status: "New Launch",
        price: { currency: "INR", min: 23_500_000, max: 34_500_000, pricePerSqft: 11_800 },
        configurations: [
            {
                label: "3 BHK Villa",
                bedrooms: 3,
                size: { min: 1980, max: 2250, unit: "sqft" },
                price: { currency: "INR", min: 23_500_000, max: 27_800_000, pricePerSqft: 11_800 },
                availability: { status: "unknown", availableUnits: null },
            },
            {
                label: "4 BHK Villa",
                bedrooms: 4,
                size: { min: 2600, max: 2925, unit: "sqft" },
                price: { currency: "INR", min: 30_500_000, max: 34_500_000, pricePerSqft: 11_800 },
                availability: { status: "unknown", availableUnits: null },
            },
        ],
        possessionDate: "2030-06-01",
        reraId: null,
        highlights: [
            "Low-rise homes with a private outdoor sit-out.",
            "A quieter setting south of the main Gurugram business districts.",
        ],
        amenities: ["Neighbourhood clubhouse", "Pool", "Walking loop", "Pet park", "Outdoor play lawn"],
        image: { url: cover.url, path: cover.path, alt: cover.alt },
        photos: gallery,
        detailUrl: null,
        dataAsOf: null,
    },
    bookingAmountInr: 1_500_000,
    paymentPlan: [
        { stage: "Expression of interest", percentage: 5, note: "Refundable as per the demo terms" },
        { stage: "On allotment", percentage: 15, note: null },
        { stage: "During construction", percentage: 70, note: "Linked to construction milestones" },
        { stage: "On possession", percentage: 10, note: null },
    ],
    nearby: [
        { kind: "Road", name: "Sohna-Gurugram Road", distance: "3.2 km", travelTime: "9 min" },
        { kind: "School", name: "Sohna town schools", distance: "4.5 km", travelTime: "12 min" },
        { kind: "Retail", name: "Local market", distance: "2.7 km", travelTime: "8 min" },
    ],
    loanBanks: ["Axis Bank", "State Bank of India"],
    locationAdvantages: [
        "A lower-density setting than the central sectors.",
        "Road access connects the area with Sohna and southern Gurugram.",
    ],
    gallery,
} satisfies DemoProjectCase;
