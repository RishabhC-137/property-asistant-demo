import type { GalleryImage } from "@property-assistant/contracts";
import type { DemoProjectCase } from "./types.js";

const gallery: GalleryImage[] = [
    {
        url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/modern-home-exterior",
        alt: "Contemporary home framed by a landscaped garden",
        category: "exterior",
    },
    {
        url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/sunlit-living-room",
        alt: "Sunlit living room with a long view through the home",
        category: "interior",
    },
    {
        url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/neutral-living-room",
        alt: "Warm, neutral-toned living room",
        category: "interior",
    },
];

const cover = gallery[0]!;

export const ASTER_VALE = {
    aliases: ["aster", "vale", "premium apartments", "sector 65"],
    card: {
        id: "fixture-0001",
        source: "fixture",
        projectCode: "DEMO-AV-01",
        slug: "aster-vale",
        name: "Aster Vale",
        developer: { id: null, name: "Aster Habitat", slug: null },
        location: {
            localityName: "Sector 65",
            localityId: null,
            city: "Gurugram",
            pincode: "122018",
            coordinates: { lat: 28.4072, lng: 77.0436 },
        },
        category: "Residential",
        propertyTypes: ["Apartment"],
        status: "Under Construction",
        price: { currency: "INR", min: 15_800_000, max: 39_500_000, pricePerSqft: 14_200 },
        configurations: [
            {
                label: "2 BHK",
                bedrooms: 2,
                size: { min: 1200, max: 1425, unit: "sqft" },
                price: { currency: "INR", min: 15_800_000, max: 18_900_000, pricePerSqft: 14_200 },
                availability: { status: "unknown", availableUnits: null },
            },
            {
                label: "3 BHK",
                bedrooms: 3,
                size: { min: 1750, max: 2050, unit: "sqft" },
                price: { currency: "INR", min: 23_600_000, max: 28_900_000, pricePerSqft: 14_200 },
                availability: { status: "unknown", availableUnits: null },
            },
            {
                label: "4 BHK",
                bedrooms: 4,
                size: { min: 2620, max: 2850, unit: "sqft" },
                price: { currency: "INR", min: 36_400_000, max: 39_500_000, pricePerSqft: 14_200 },
                availability: { status: "unknown", availableUnits: null },
            },
        ],
        possessionDate: "2029-03-01",
        reraId: null,
        highlights: [
            "Three landscaped courtyards break up the podium level.",
            "The tower layout places most homes away from the main road.",
        ],
        amenities: ["Clubhouse", "Lap pool", "Fitness studio", "Co-working lounge", "Kids' play area", "EV charging"],
        image: { url: cover.url, path: cover.path, alt: cover.alt },
        photos: gallery,
        detailUrl: null,
        dataAsOf: null,
    },
    bookingAmountInr: 1_000_000,
    paymentPlan: [
        { stage: "On booking", percentage: 10, note: "Booking amount is part of the total price" },
        { stage: "On allotment", percentage: 10, note: null },
        { stage: "During construction", percentage: 70, note: "Linked to construction milestones" },
        { stage: "On possession", percentage: 10, note: null },
    ],
    nearby: [
        { kind: "Road", name: "Golf Course Extension Road", distance: "1.2 km", travelTime: "5 min" },
        { kind: "School", name: "Sector 65 school cluster", distance: "2.4 km", travelTime: "10 min" },
        { kind: "Retail", name: "Local high street", distance: "1.8 km", travelTime: "7 min" },
    ],
    loanBanks: ["HDFC Bank", "ICICI Bank", "State Bank of India"],
    locationAdvantages: [
        "Connects to Golf Course Extension Road.",
        "Daily retail and schools are within a short drive.",
    ],
    gallery,
} satisfies DemoProjectCase;
