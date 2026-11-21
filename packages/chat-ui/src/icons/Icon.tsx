import { createContext, useContext } from "react";
import { resolveIcons } from "./resolveIcons.js";
import type { IconName, ResolvedIcons } from "./types.js";

const IconContext = createContext<ResolvedIcons>(resolveIcons());

export const IconProvider = IconContext.Provider;

export interface IconProps {
    name: IconName;
    size?: number;
    className?: string;
    /** Accessible label. Without it the icon is decorative (hidden from screen readers). */
    title?: string;
}

/** Renders the configured icon for `name`, whatever library it comes from. */
export function Icon({ name, size = 18, className, title }: IconProps) {
    const { component: Component, props } = useContext(IconContext)[name];
    return (
        <Component
            {...props}
            size={size}
            width={size}
            height={size}
            className={["rec-icon", className].filter(Boolean).join(" ")}
            aria-hidden={title ? undefined : true}
            aria-label={title}
            title={title}
        />
    );
}
