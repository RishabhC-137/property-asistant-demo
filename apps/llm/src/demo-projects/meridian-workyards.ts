import type { GalleryImage } from "@property-assistant/contracts";
import type { DemoProjectCase } from "./types.js";

const gallery: GalleryImage[] = [
    {
        url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/workplace-interior",
        alt: "Open-plan workspace with shared desks and meeting areas",
        category: "interior",
    },
    {
        url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/office-building",
        alt: "Contemporary office building facade",
        category: "exterior",
    },
    {
        url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=85",
        path: "unsplash/meeting-space",
        alt: "Bright meeting room in a modern workplace",
        category: "interior",
    },
];

const cover = gallery[0]!;

export const MERIDIAN_WORKYARDS = {
    aliases: ["meridian", "workyards", "office", "offices", "commercial", "sector 44"],
    card: {
        id: "fixture-0004",
        source: "fixture",
        projectCode: "DEMO-MW-04",
        slug: "meridian-workyards",
        name: "Meridian Workyards",
        developer: { id: null, name: "Meridian Commercial", slug: null },
        location: {
            localityName: "Sector 44",
            localityId: null,
            city: "Gurugram",
            pincode: "122003",
            coordinates: { lat: 28.4481, lng: 77.0732 },
        },
        category: "Commercial",
        propertyTypes: ["Office"],
        status: "Under Construction",
        price: { currency: "INR", min: 7_800_000, max: 22_000_000, pricePerSqft: 10_400 },
        configurations: [
            {
                label: "Office suite",
                bedrooms: null,
                size: { min: 750, max: 1100, unit: "sqft" },
                price: { currency: "INR", min: 7_800_000, max: 11_500_000, pricePerSqft: 10_400 },
                availability: { status: "unknown", availableUnits: null },
            },
            {
                label: "Large office",
                bedrooms: null,
                size: { min: 1400, max: 1800, unit: "sqft" },
                price: { currency: "INR", min: 14_600_000, max: 22_000_000, pricePerSqft: 10_400 },
                availability: { status: "unknown", availableUnits: null },
            },
        ],
        possessionDate: "2028-12-01",
        reraId: null,
        highlights: [
            "Flexible office footprints for small teams and growing firms.",
            "Shared meeting rooms and a lobby are planned for the ground floor.",
        ],
        amenities: ["Reception lobby", "Shared meeting rooms", "Backup power", "Visitor parking", "Cafe"],
        image: { url: cover.url, path: cover.path, alt: cover.alt },
        photos: gallery,
        detailUrl: null,
        dataAsOf: null,
    },
    bookingAmountInr: 750_000,
    paymentPlan: [
        { stage: "On booking", percentage: 10, note: "Booking amount is part of the total price" },
        { stage: "On agreement", percentage: 20, note: null },
        { stage: "During construction", percentage: 60, note: "Linked to construction milestones" },
        { stage: "On handover", percentage: 10, note: null },
    ],
    nearby: [
        { kind: "Metro", name: "HUDA City Centre", distance: "1.4 km", travelTime: "6 min" },
        { kind: "Road", name: "NH-48", distance: "2.2 km", travelTime: "8 min" },
        { kind: "Retail", name: "Sector 44 market", distance: "700 m", travelTime: "3 min" },
    ],
    loanBanks: ["HDFC Bank", "ICICI Bank", "Kotak Mahindra Bank"],
    locationAdvantages: [
        "Close to established offices and the central business district.",
        "Metro and NH-48 access are both within a short drive.",
    ],
    gallery,
} satisfies DemoProjectCase;
