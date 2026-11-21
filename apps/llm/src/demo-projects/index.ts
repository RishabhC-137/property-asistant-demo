import { ASTER_VALE } from "./aster-vale.js";
import { CEDAR_COURTYARDS } from "./cedar-courtyards.js";
import { MERIDIAN_WORKYARDS } from "./meridian-workyards.js";
import { MORROW_GROVE } from "./morrow-grove.js";
import type { DemoProjectCase } from "./types.js";

export const DEMO_PROJECTS: readonly DemoProjectCase[] = [
    ASTER_VALE,
    MORROW_GROVE,
    CEDAR_COURTYARDS,
    MERIDIAN_WORKYARDS,
];

export function findDemoProject(message: string): DemoProjectCase {
    const query = message.toLowerCase();
    return (
        DEMO_PROJECTS.find((project) =>
            [project.card.name, ...project.aliases].some((alias) => query.includes(alias.toLowerCase())),
        ) ?? DEMO_PROJECTS[0]!
    );
}
