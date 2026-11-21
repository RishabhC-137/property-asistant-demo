import { defaultIcons } from "./defaultIcons.js";
import {
    ICON_NAMES,
    type IconComponent,
    type IconLibraryConfig,
    type IconName,
    type IconsInput,
    type IconSet,
    type ResolvedIcons,
} from "./types.js";

/** A component can be a function, a class, or a memo/forwardRef object. */
function isComponent(value: unknown): value is IconComponent {
    return (
        typeof value === "function" ||
        (typeof value === "object" && value !== null && "$$typeof" in value)
    );
}

export function isIconLibraryConfig(input: IconsInput): input is IconLibraryConfig {
    return typeof input === "object" && input !== null && "library" in input && "names" in input;
}

/**
 * Picks components out of any icon library by export name.
 * Unknown names are reported in `missing` and fall back to the built-ins.
 */
export function fromIconLibrary(
    library: Record<string, unknown>,
    names: Partial<Record<IconName, string>>,
): { icons: IconSet; missing: string[] } {
    const icons: IconSet = {};
    const missing: string[] = [];
    for (const [name, exportName] of Object.entries(names) as Array<[IconName, string]>) {
        const component = library[exportName];
        if (isComponent(component)) icons[name] = component;
        else missing.push(`${name} → "${exportName}"`);
    }
    return { icons, missing };
}

/** Merges user icons over the built-in set. Every name always resolves. */
export function resolveIcons(input?: IconsInput | null): ResolvedIcons {
    let custom: IconSet = {};
    let props: Record<string, unknown> = {};

    if (input && isIconLibraryConfig(input)) {
        const { icons, missing } = fromIconLibrary(input.library, input.names);
        if (missing.length > 0 && typeof console !== "undefined") {
            console.warn(`[chat-ui] icons not found in library, using built-ins: ${missing.join(", ")}`);
        }
        custom = icons;
        props = input.props ?? {};
    } else if (input) {
        custom = input;
    }

    const resolved = {} as ResolvedIcons;
    for (const name of ICON_NAMES) {
        const component = custom[name];
        resolved[name] = component && isComponent(component)
            ? { component, props }
            : { component: defaultIcons[name], props: {} };
    }
    return resolved;
}
