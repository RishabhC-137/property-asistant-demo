import type { GalleryImage, PropertyCard } from "@property-assistant/contracts";
import type { DemoProjectCase } from "./types.js";

type ProjectKind = "apartment" | "villa" | "office" | "retail" | "plot" | "warehouse";

interface ProjectSeed {
    name: string;
    kind: ProjectKind;
    developer: string;
    locality: string;
    city: string;
    status: string;
    configuration: string;
    bedrooms: number | null;
    size: readonly [number, number];
    unit: "sqft" | "sq yd";
    priceCr: readonly [number, number];
    highlight: string;
}

const PROJECTS = [
    { name: "Saffron House", kind: "apartment", developer: "Saffron Living", locality: "Sector 63", city: "Gurugram", status: "Under Construction", configuration: "2–3 BHK", bedrooms: 2, size: [1180, 1840], unit: "sqft", priceCr: [1.45, 2.85], highlight: "A quieter courtyard layout near the Golf Course Extension Road corridor." },
    { name: "Olive Quarter", kind: "apartment", developer: "Olive Habitat", locality: "Sector 66", city: "Gurugram", status: "New Launch", configuration: "Studio", bedrooms: null, size: [520, 690], unit: "sqft", priceCr: [1.65, 2.45], highlight: "Compact studio homes along the Golf Course Extension Road corridor." },
    { name: "Juniper Residences", kind: "apartment", developer: "Juniper Buildworks", locality: "Sector 70A", city: "Gurugram", status: "Under Construction", configuration: "3–4 BHK", bedrooms: 3, size: [1760, 2680], unit: "sqft", priceCr: [2.4, 4.2], highlight: "A low-density residential address with a shared garden court." },
    { name: "Luma Residences", kind: "apartment", developer: "Luma Living", locality: "Sector 62", city: "Gurugram", status: "New Launch", configuration: "Studio", bedrooms: null, size: [490, 720], unit: "sqft", priceCr: [1.55, 2.65], highlight: "Studio layouts with a simple commute to Golf Course Extension Road." },
    { name: "Orchard Nine", kind: "apartment", developer: "Orchard Nine Homes", locality: "Sector 57", city: "Gurugram", status: "Ready to Move", configuration: "2–3 BHK", bedrooms: 2, size: [1120, 1980], unit: "sqft", priceCr: [1.25, 2.6], highlight: "A ready-to-move community with a central planted court." },
    { name: "Pine & Park", kind: "apartment", developer: "Pinepark Estates", locality: "Sector 67A", city: "Gurugram", status: "Under Construction", configuration: "2–3 BHK", bedrooms: 2, size: [1210, 1930], unit: "sqft", priceCr: [1.7, 3.15], highlight: "A shaded walking loop sits between the residential blocks." },
    { name: "Solace 41", kind: "apartment", developer: "Solace Habitat", locality: "Sector 41", city: "Gurugram", status: "Ready to Move", configuration: "2–4 BHK", bedrooms: 2, size: [1150, 2780], unit: "sqft", priceCr: [1.8, 4.6], highlight: "A central Gurugram address with homes in three size bands." },
    { name: "Haven House", kind: "apartment", developer: "Havenstone", locality: "Sector 68", city: "Gurugram", status: "Under Construction", configuration: "3 BHK", bedrooms: 3, size: [1680, 2140], unit: "sqft", priceCr: [2.25, 3.4], highlight: "Family-sized homes with a dedicated indoor recreation room." },
    { name: "Alder Court", kind: "apartment", developer: "Alder & Co.", locality: "Sector 50", city: "Gurugram", status: "New Launch", configuration: "2–3 BHK", bedrooms: 2, size: [1080, 1870], unit: "sqft", priceCr: [1.6, 3.05], highlight: "A compact block plan with shared outdoor seating." },
    { name: "Common Ground", kind: "apartment", developer: "Common Ground Homes", locality: "Sector 76", city: "Gurugram", status: "Under Construction", configuration: "2–4 BHK", bedrooms: 2, size: [1160, 2760], unit: "sqft", priceCr: [1.35, 3.9], highlight: "A community-led layout with a flexible multipurpose hall." },
    { name: "Fernlight", kind: "apartment", developer: "Fernlight Living", locality: "Sector 63A", city: "Gurugram", status: "New Launch", configuration: "Studio", bedrooms: null, size: [540, 760], unit: "sqft", priceCr: [1.75, 2.95], highlight: "Studios near the Golf Course Extension Road corridor." },
    { name: "Northline Residences", kind: "apartment", developer: "Northline Properties", locality: "Sector 89", city: "Gurugram", status: "Under Construction", configuration: "2–3 BHK", bedrooms: 2, size: [1090, 1910], unit: "sqft", priceCr: [1.1, 2.55], highlight: "A practical mix of two- and three-bedroom homes." },
    { name: "The Courtyard House", kind: "villa", developer: "Courtyard Living", locality: "Sector 33", city: "Sohna", status: "New Launch", configuration: "3–4 BHK Villa", bedrooms: 3, size: [2480, 3620], unit: "sqft", priceCr: [2.8, 4.9], highlight: "Private garden plots open onto a landscaped internal lane." },
    { name: "Willow Bend Villas", kind: "villa", developer: "Willow Bend Estates", locality: "Sector 2", city: "Sohna", status: "Under Construction", configuration: "3–4 BHK Villa", bedrooms: 3, size: [2210, 3380], unit: "sqft", priceCr: [2.35, 4.4], highlight: "A small collection of homes with shaded front verandas." },
    { name: "Aravali Greens", kind: "villa", developer: "Aravali Houseworks", locality: "Sector 5", city: "Sohna", status: "New Launch", configuration: "4 BHK Villa", bedrooms: 4, size: [2860, 4120], unit: "sqft", priceCr: [3.6, 6.2], highlight: "Larger family homes arranged around a shared green." },
    { name: "Kanso Fields", kind: "villa", developer: "Kanso Living", locality: "Sector 36", city: "Gurugram", status: "Under Construction", configuration: "3–4 BHK Villa", bedrooms: 3, size: [2340, 3580], unit: "sqft", priceCr: [3.1, 5.3], highlight: "Simple modern elevations and a private outdoor sitting area." },
    { name: "The Ridge House", kind: "villa", developer: "Ridge House Group", locality: "Sector 4", city: "Sohna", status: "Ready to Move", configuration: "3 BHK Villa", bedrooms: 3, size: [2120, 2860], unit: "sqft", priceCr: [2.65, 3.75], highlight: "Ready homes with a small private terrace and garden." },
    { name: "Sona Orchard Villas", kind: "villa", developer: "Sona Orchard Developers", locality: "Sector 35", city: "Sohna", status: "Under Construction", configuration: "3–5 BHK Villa", bedrooms: 3, size: [2300, 4620], unit: "sqft", priceCr: [2.9, 6.8], highlight: "A range of villa sizes arranged along planted streets." },
    { name: "Sixteen Palms", kind: "villa", developer: "Sixteen Palms Habitat", locality: "Sector 66", city: "Gurugram", status: "New Launch", configuration: "4 BHK Villa", bedrooms: 4, size: [2750, 3840], unit: "sqft", priceCr: [4.1, 6.5], highlight: "Sixteen courtyard-facing homes with private roof decks." },
    { name: "Aranya Grove", kind: "villa", developer: "Aranya Build Co.", locality: "Sector 37D", city: "Gurugram", status: "Under Construction", configuration: "3–4 BHK Villa", bedrooms: 3, size: [2420, 3760], unit: "sqft", priceCr: [3.25, 5.8], highlight: "A low-rise plan with pocket gardens between homes." },
    { name: "The Foundry", kind: "office", developer: "Foundry Commercial", locality: "Sector 44", city: "Gurugram", status: "Under Construction", configuration: "Office suites", bedrooms: null, size: [720, 2450], unit: "sqft", priceCr: [0.82, 2.9], highlight: "Flexible office plates with shared meeting rooms." },
    { name: "Crossbeam Offices", kind: "office", developer: "Crossbeam Workspaces", locality: "Sector 48", city: "Gurugram", status: "Ready to Move", configuration: "Office suites", bedrooms: null, size: [850, 3200], unit: "sqft", priceCr: [0.95, 3.8], highlight: "Ready office units with a reception and shared conference floor." },
    { name: "District Twelve", kind: "office", developer: "District Twelve Properties", locality: "Sector 12", city: "Gurugram", status: "Under Construction", configuration: "Office suites", bedrooms: null, size: [680, 2100], unit: "sqft", priceCr: [0.72, 2.4], highlight: "A compact commercial block with small and mid-size offices." },
    { name: "Helix Works", kind: "office", developer: "Helix Workplaces", locality: "Sector 53", city: "Gurugram", status: "New Launch", configuration: "Office suites", bedrooms: null, size: [910, 3600], unit: "sqft", priceCr: [1.2, 4.6], highlight: "Work suites grouped around a shared business lounge." },
    { name: "The Exchange", kind: "office", developer: "Exchange Square", locality: "Sector 62", city: "Gurugram", status: "Under Construction", configuration: "Office suites", bedrooms: null, size: [760, 2800], unit: "sqft", priceCr: [0.9, 3.25], highlight: "A business address near the Golf Course Extension Road corridor." },
    { name: "Loom Business Park", kind: "office", developer: "Loom Commercial", locality: "Sector 67", city: "Gurugram", status: "Under Construction", configuration: "Office suites", bedrooms: null, size: [1050, 4600], unit: "sqft", priceCr: [1.25, 5.4], highlight: "Larger office floors with an outdoor lunch terrace." },
    { name: "Copperline Suites", kind: "office", developer: "Copperline Developments", locality: "Sector 32", city: "Gurugram", status: "Ready to Move", configuration: "Office suites", bedrooms: null, size: [640, 1850], unit: "sqft", priceCr: [0.68, 2.2], highlight: "Ready-to-occupy suites for small teams and professional services." },
    { name: "Northstar Workspaces", kind: "office", developer: "Northstar Commercial", locality: "Sector 83", city: "Gurugram", status: "New Launch", configuration: "Office suites", bedrooms: null, size: [780, 3000], unit: "sqft", priceCr: [0.88, 3.6], highlight: "An adaptable floor plan with shared breakout space." },
    { name: "Bazaar Row", kind: "retail", developer: "Bazaar Row Retail", locality: "Sector 65", city: "Gurugram", status: "Under Construction", configuration: "Retail shops", bedrooms: null, size: [420, 1600], unit: "sqft", priceCr: [0.72, 2.8], highlight: "Street-facing shops along a pedestrian-friendly retail lane." },
    { name: "Market Lane", kind: "retail", developer: "Market Lane Properties", locality: "Sector 56", city: "Gurugram", status: "Ready to Move", configuration: "Retail shops", bedrooms: null, size: [360, 1320], unit: "sqft", priceCr: [0.62, 2.25], highlight: "Ready retail units with direct frontage onto the internal street." },
    { name: "The Arcade at 58", kind: "retail", developer: "Arcade Eight Retail", locality: "Sector 58", city: "Gurugram", status: "New Launch", configuration: "Retail shops", bedrooms: null, size: [390, 1480], unit: "sqft", priceCr: [0.68, 2.55], highlight: "Small-format shops with a covered central walkway." },
    { name: "Corner House Retail", kind: "retail", developer: "Corner House Group", locality: "Sector 49", city: "Gurugram", status: "Under Construction", configuration: "Retail shops", bedrooms: null, size: [480, 1900], unit: "sqft", priceCr: [0.88, 3.45], highlight: "Corner-facing retail units with a flexible shopfront." },
    { name: "Mainstreet 36", kind: "retail", developer: "Mainstreet Developments", locality: "Sector 36", city: "Gurugram", status: "New Launch", configuration: "Retail shops", bedrooms: null, size: [400, 1740], unit: "sqft", priceCr: [0.74, 3.1], highlight: "A neighborhood high street with shop and café-sized units." },
    { name: "Orchard Walk Shops", kind: "retail", developer: "Orchard Walk Retail", locality: "Sector 67A", city: "Gurugram", status: "Under Construction", configuration: "Retail shops", bedrooms: null, size: [350, 1250], unit: "sqft", priceCr: [0.58, 2.15], highlight: "A short retail promenade beside a planted public court." },
    { name: "Aravali Plot Co.", kind: "plot", developer: "Aravali Landworks", locality: "Sector 35", city: "Sohna", status: "New Launch", configuration: "Residential plots", bedrooms: null, size: [120, 240], unit: "sq yd", priceCr: [0.78, 1.9], highlight: "Residential plots in a low-rise layout with internal roads." },
    { name: "The Orchard Parcels", kind: "plot", developer: "Orchard Land Co.", locality: "Sector 36", city: "Sohna", status: "Under Construction", configuration: "Residential plots", bedrooms: null, size: [150, 300], unit: "sq yd", priceCr: [0.95, 2.35], highlight: "A plotted neighborhood with a small shared orchard green." },
    { name: "Sohna Farm Plots", kind: "plot", developer: "Sohna Fields", locality: "Sector 2", city: "Sohna", status: "New Launch", configuration: "Farm plots", bedrooms: null, size: [500, 1200], unit: "sq yd", priceCr: [1.1, 2.8], highlight: "Larger land parcels shown for illustrative planning only." },
    { name: "Meadowfield Estate", kind: "plot", developer: "Meadowfield Land", locality: "Sector 5", city: "Sohna", status: "Under Construction", configuration: "Residential plots", bedrooms: null, size: [135, 270], unit: "sq yd", priceCr: [0.86, 2.1], highlight: "A mix of plot sizes around a simple landscaped spine." },
    { name: "Aster Edge Plots", kind: "plot", developer: "Aster Edge Estates", locality: "Sector 70A", city: "Gurugram", status: "New Launch", configuration: "Residential plots", bedrooms: null, size: [180, 360], unit: "sq yd", priceCr: [1.45, 3.6], highlight: "Residential land parcels with a range of frontage widths." },
    { name: "Ridgeview Land", kind: "plot", developer: "Ridgeview Land Co.", locality: "Sector 4", city: "Sohna", status: "Ready to Move", configuration: "Residential plots", bedrooms: null, size: [125, 250], unit: "sq yd", priceCr: [0.82, 1.95], highlight: "Ready plotted parcels within an illustrative low-rise layout." },
    { name: "Delta Logistics Park", kind: "warehouse", developer: "Delta Industrial", locality: "Sector 37D", city: "Gurugram", status: "Under Construction", configuration: "Warehouse units", bedrooms: null, size: [4200, 18000], unit: "sqft", priceCr: [2.2, 9.5], highlight: "Warehouse units with loading access and a shared service yard." },
    { name: "Northgate Warehousing", kind: "warehouse", developer: "Northgate Logistics", locality: "Sector 89", city: "Gurugram", status: "New Launch", configuration: "Warehouse units", bedrooms: null, size: [5000, 24000], unit: "sqft", priceCr: [2.6, 12.5], highlight: "A range of storage bays with vehicle circulation space." },
    { name: "Cargo Commons", kind: "warehouse", developer: "Cargo Commons Industrial", locality: "Sector 88A", city: "Gurugram", status: "Under Construction", configuration: "Warehouse units", bedrooms: null, size: [3600, 14500], unit: "sqft", priceCr: [1.8, 7.8], highlight: "Mid-size logistics units with shared loading infrastructure." },
    { name: "A-Frame Industrial", kind: "warehouse", developer: "A-Frame Works", locality: "Sector 34", city: "Gurugram", status: "Ready to Move", configuration: "Warehouse units", bedrooms: null, size: [2800, 12000], unit: "sqft", priceCr: [1.45, 6.3], highlight: "Ready industrial units with flexible storage layouts." },
    { name: "Transit Yard 54", kind: "warehouse", developer: "Transit Yard Properties", locality: "Sector 54", city: "Gurugram", status: "Under Construction", configuration: "Warehouse units", bedrooms: null, size: [3900, 16000], unit: "sqft", priceCr: [2.05, 8.7], highlight: "A compact logistics yard with warehouse and service units." },
    { name: "Meridian Storage Park", kind: "warehouse", developer: "Meridian Industrial", locality: "Sector 74A", city: "Gurugram", status: "New Launch", configuration: "Warehouse units", bedrooms: null, size: [4500, 21000], unit: "sqft", priceCr: [2.4, 11.2], highlight: "A selection of storage footprints around a shared access road." },
] as const satisfies readonly ProjectSeed[];

const PHOTO_SETS: Record<ProjectKind, readonly GalleryImage[]> = {
    apartment: [
        { url: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85", path: "unsplash/bright-apartment-interior", alt: "Bright apartment living room", category: "interior" },
        { url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85", path: "unsplash/neutral-apartment-lounge", alt: "Warm neutral-toned lounge", category: "interior" },
        { url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85", path: "unsplash/contemporary-residence", alt: "Contemporary residential exterior", category: "exterior" },
    ],
    villa: [
        { url: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85", path: "unsplash/low-rise-villa", alt: "Low-rise home with a landscaped garden", category: "exterior" },
        { url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85", path: "unsplash/villa-interior", alt: "Light-filled residential interior", category: "interior" },
        { url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85", path: "unsplash/villa-living-room", alt: "Living room opening toward a garden", category: "interior" },
    ],
    office: [
        { url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85", path: "unsplash/open-office", alt: "Open-plan office and meeting area", category: "interior" },
        { url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=85", path: "unsplash/shared-workspace", alt: "Shared workspace with natural light", category: "interior" },
        { url: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=85", path: "unsplash/office-meeting-room", alt: "Modern office meeting room", category: "interior" },
    ],
    retail: [
        { url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85", path: "unsplash/retail-storefront", alt: "Illustrative retail shop interior", category: "interior" },
        { url: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=1200&q=85", path: "unsplash/retail-market", alt: "Retail aisles in a neighborhood market", category: "interior" },
        { url: "https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=1200&q=85", path: "unsplash/retail-counter", alt: "Small retail counter and shelving", category: "interior" },
    ],
    plot: [
        { url: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85", path: "unsplash/open-landscape", alt: "Open landscape illustrating a land parcel", category: "site_plan" },
        { url: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85", path: "unsplash/green-hillside", alt: "Green landscape and distant hills", category: "site_plan" },
        { url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85", path: "unsplash/open-field", alt: "Open field under a wide sky", category: "site_plan" },
    ],
    warehouse: [
        { url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=85", path: "unsplash/warehouse-interior", alt: "Warehouse interior with storage racks", category: "interior" },
        { url: "https://images.unsplash.com/photo-1565610222536-ef125c59da2e?auto=format&fit=crop&w=1200&q=85", path: "unsplash/logistics-warehouse", alt: "Illustrative logistics warehouse", category: "interior" },
        { url: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1200&q=85", path: "unsplash/industrial-storage", alt: "Industrial storage and loading area", category: "interior" },
    ],
};

const TYPE_LABEL: Record<ProjectKind, string> = {
    apartment: "Apartment",
    villa: "Villa",
    office: "Office",
    retail: "Retail",
    plot: "Plot",
    warehouse: "Warehouse",
};

const AMENITIES: Record<ProjectKind, string[]> = {
    apartment: ["Clubhouse", "Fitness studio", "Kids' play area", "EV charging"],
    villa: ["Private garden", "Terrace", "Residents' lounge"],
    office: ["Meeting rooms", "Reception", "Breakout lounge"],
    retail: ["Street frontage", "Covered walkway", "Customer parking"],
    plot: ["Internal roads", "Street lighting", "Green space"],
    warehouse: ["Loading bays", "Vehicle access", "Shared service yard"],
};

const rupees = (crore: number) => Math.round(crore * 10_000_000);
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function makeProject(seed: ProjectSeed, index: number): DemoProjectCase {
    const gallery = PHOTO_SETS[seed.kind];
    const cover = gallery[0]!;
    const [minCr, maxCr] = seed.priceCr;
    const [minSize, maxSize] = seed.size;
    const price = {
        currency: "INR" as const,
        min: rupees(minCr),
        max: rupees(maxCr),
        pricePerSqft: seed.unit === "sqft" ? Math.round((rupees(minCr) / maxSize + rupees(maxCr) / minSize) / 2) : null,
    };
    const hasExtensionRoad = /golf course extension road/i.test(seed.highlight);
    const sector = Number(seed.locality.match(/\d+/)?.[0] ?? 65);
    const card = {
        id: `fixture-${String(index + 5).padStart(4, "0")}`,
        source: "fixture" as const,
        projectCode: `DEMO-${String(index + 5).padStart(2, "0")}`,
        slug: slugify(seed.name),
        name: seed.name,
        developer: { id: null, name: seed.developer, slug: null },
        location: {
            localityName: seed.locality,
            localityId: null,
            city: seed.city,
            pincode: null,
            coordinates: {
                lat: seed.city === "Sohna" ? 28.25 + sector * 0.0005 : 28.385 + sector * 0.00035,
                lng: seed.city === "Sohna" ? 77.07 + sector * 0.0004 : 77.025 + sector * 0.0003,
            },
        },
        category: seed.kind === "office" || seed.kind === "retail" || seed.kind === "warehouse" ? "Commercial" : "Residential",
        propertyTypes: [TYPE_LABEL[seed.kind]],
        status: seed.status,
        price,
        configurations: [
            {
                label: seed.configuration,
                bedrooms: seed.bedrooms,
                size: { min: minSize, max: maxSize, unit: seed.unit },
                price,
                availability: { status: "unknown" as const, availableUnits: null },
            },
        ],
        possessionDate: seed.status === "Ready to Move" ? null : "2029-12-01",
        reraId: null,
        highlights: [seed.highlight],
        amenities: AMENITIES[seed.kind],
        image: { url: cover.url, path: cover.path, alt: cover.alt },
        photos: [...gallery],
        detailUrl: null,
        dataAsOf: null,
    } satisfies PropertyCard;

    return {
        card,
        aliases: [
            seed.name.toLowerCase(),
            seed.locality.toLowerCase(),
            ...(seed.bedrooms === null ? [seed.configuration.toLowerCase()] : []),
            ...(hasExtensionRoad ? ["golf course extension road", "golf course ext road"] : []),
        ],
        bookingAmountInr: Math.round(price.min! * 0.05),
        paymentPlan: [
            { stage: "On booking", percentage: 10, note: "Illustrative portion of the total price" },
            { stage: "During construction", percentage: 70, note: "Illustrative milestone schedule" },
            { stage: "On possession", percentage: 20, note: null },
        ],
        nearby: hasExtensionRoad
            ? [{ kind: "Road", name: "Golf Course Extension Road", distance: null, travelTime: null }]
            : [],
        loanBanks: [],
        locationAdvantages: [seed.highlight],
        gallery: [...gallery],
    };
}

export const ADDITIONAL_PROJECTS: readonly DemoProjectCase[] = PROJECTS.map((project, index) => makeProject(project, index));
