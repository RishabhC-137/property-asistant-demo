import type { ReactNode } from "react";
import { Icon } from "../icons/Icon.js";

export function Notice({ children, tone = "notice" }: { children: ReactNode; tone?: "notice" | "danger" }) {
    return (
        <div className={`rec-notice rec-notice--${tone}`} role={tone === "danger" ? "alert" : undefined}>
            <Icon name={tone === "danger" ? "alert" : "info"} size={15} />
            <span>{children}</span>
        </div>
    );
}
