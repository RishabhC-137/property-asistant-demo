import type { PropertyCard } from "@property-assistant/contracts";
import { DEMO_PROJECTS } from "./demo-projects/index.js";

export const FIXTURE_NOTICE =
    "Illustrative demo data only — these are not real listings, prices or availability.";

export const FIXTURE_PROPERTIES: readonly PropertyCard[] = DEMO_PROJECTS.map((project) => project.card);

export { DEMO_PROJECTS, findDemoProject } from "./demo-projects/index.js";
