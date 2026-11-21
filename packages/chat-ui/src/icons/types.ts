import type { ComponentType } from "react";

/** Every icon the widget uses, by semantic name. */
export const ICON_NAMES = [
    "send",
    "stop",
    "retry",
    "newChat",
    "history",
    "close",
    "chevronUp",
    "chevronLeft",
    "chevronRight",
    "heart",
    "location",
    "calendar",
    "car",
    "video",
    "googleMeet",
    "microsoftTeams",
    "zoom",
    "walk",
    "building",
    "area",
    "rupee",
    "externalLink",
    "alert",
    "check",
    "info",
    "sparkles",
    "image",
    "user",
    "bot",
    "share",
    "whatsapp",
    "mail",
    "message",
    "copy",
    "phone",
    "trash",
    "bed",
    "page",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Any React component that renders an icon. Popular libraries (lucide-react,
 * react-icons, @heroicons/react, @phosphor-icons/react, @tabler/icons-react …)
 * all accept some of `size`, `width`, `height` and `className`; the widget
 * passes all of them so any of those libraries just works. `any` is deliberate:
 * each library types its props differently.
 */
export type IconComponent = ComponentType<any>;

/** Option 1: give components directly — `{ send: Send, retry: RotateCw }`. */
export type IconSet = Partial<Record<IconName, IconComponent>>;

/**
 * Option 2: give a whole icon library plus which export to use for each name:
 * `{ library: LucideIcons, names: { send: "Send", retry: "RotateCw" } }`.
 * Names you leave out fall back to the built-in icons.
 */
export interface IconLibraryConfig {
    library: Record<string, unknown>;
    names: Partial<Record<IconName, string>>;
    /** Extra props for every icon from this library, e.g. `{ strokeWidth: 1.75 }`. */
    props?: Record<string, unknown>;
}

export type IconsInput = IconSet | IconLibraryConfig;

export interface ResolvedIcon {
    component: IconComponent;
    props: Record<string, unknown>;
}

export type ResolvedIcons = Record<IconName, ResolvedIcon>;
