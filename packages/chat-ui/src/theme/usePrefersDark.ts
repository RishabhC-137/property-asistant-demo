import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const media = window.matchMedia(QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
}

const getSnapshot = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;

/** Live OS dark-mode preference (for `theme="auto"`). */
export function usePrefersDark(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
