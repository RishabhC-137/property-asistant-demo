import type { GalleryImage } from "@property-assistant/contracts";
import type { DemoProjectCase } from "./types.js";

const gallery: GalleryImage[] = [
    {
        url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/bright-living-room",
        alt: "Bright living room with a balcony-facing seating area",
        category: "interior",
    },
    {
        url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/contemporary-apartment",
        alt: "Contemporary apartment interior with a dining area",
        category: "interior",
    },
    {
        url: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/modern-building",
        alt: "Modern building facade against a clear sky",
        category: "exterior",
    },
];

const cover = gallery[0]!;

export const MORROW_GROVE = {
    aliases: ["morrow", "grove", "ready to move", "sector 49"],
    card: {
        id: "fixture-0002",
        source: "fixture",
        projectCode: "DEMO-MG-02",
        slug: "morrow-grove",
        name: "Morrow Grove",
        developer: { id: null, name: "Fieldstone Living", slug: null },
        location: {
            localityName: "Sector 49",
            localityId: null,
            city: "Gurugram",
            pincode: "122018",
            coordinates: { lat: 28.4141, lng: 77.0524 },
        },
        category: "Residential",
        propertyTypes: ["Apartment"],
        status: "Ready to Move",
        price: { currency: "INR", min: 8_900_000, max: 14_800_000, pricePerSqft: 9_600 },
        configurations: [
            {
                label: "2 BHK",
                bedrooms: 2,
                size: { min: 925, max: 1120, unit: "sqft" },
                price: { currency: "INR", min: 8_900_000, max: 10_900_000, pricePerSqft: 9_600 },
                availability: { status: "unknown", availableUnits: null },
            },
            {
                label: "3 BHK",
                bedrooms: 3,
                size: { min: 1280, max: 1540, unit: "sqft" },
                price: { currency: "INR", min: 11_800_000, max: 14_800_000, pricePerSqft: 9_600 },
                availability: { status: "unknown", availableUnits: null },
            },
        ],
        possessionDate: null,
        reraId: null,
        highlights: [
            "Ready homes across two practical apartment layouts.",
            "Shared greens sit between the residential blocks.",
        ],
        amenities: ["Residents' lounge", "Gym", "Children's play area", "Garden", "Visitor parking"],
        image: { url: cover.url, path: cover.path, alt: cover.alt },
        photos: gallery,
        detailUrl: null,
        dataAsOf: null,
    },
    bookingAmountInr: 500_000,
    paymentPlan: [
        { stage: "On booking", percentage: 10, note: "Booking amount is part of the total price" },
        { stage: "On agreement", percentage: 80, note: "As per the sale agreement" },
        { stage: "On handover", percentage: 10, note: null },
    ],
    nearby: [
        { kind: "Road", name: "Sohna Road", distance: "1.5 km", travelTime: "6 min" },
        { kind: "Hospital", name: "Community hospital", distance: "2.1 km", travelTime: "8 min" },
        { kind: "Retail", name: "Sector 49 market", distance: "900 m", travelTime: "4 min" },
    ],
    loanBanks: ["Axis Bank", "HDFC Bank", "ICICI Bank"],
    locationAdvantages: [
        "Everyday shopping is close to the project.",
        "Sohna Road provides access to business districts in both directions.",
    ],
    gallery,
} satisfies DemoProjectCase;
