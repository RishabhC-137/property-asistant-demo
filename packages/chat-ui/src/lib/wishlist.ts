import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";

/** The project a heart saves, as the host website needs it. */
export interface WishlistProject {
    id: string;
    name: string;
    detailUrl?: string | null;
}

/**
 * Where saved projects live. A host website passes its own (e.g. its account
 * wishlist), so a heart tapped in the chat is the same heart as on the site.
 * Without one, saves are kept in this browser only.
 */
export interface WishlistAdapter {
    has(projectId: string): boolean;
    /** Adds or removes the project; may reject (e.g. the visitor is not signed in). */
    toggle(project: WishlistProject): void | Promise<void>;
    /** Calls `listener` whenever the saved set changes; returns an unsubscribe. */
    subscribe(listener: () => void): () => void;
}

const FAVOURITES_KEY = "rec-favourite-projects";

function readLocal(): string[] {
    try {
        const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(FAVOURITES_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

/** The fallback: this browser's localStorage, shared by every card on the page. */
function createLocalWishlist(): WishlistAdapter {
    const listeners = new Set<() => void>();
    let ids = new Set(readLocal());
    return {
        has: (id) => ids.has(id),
        toggle: ({ id }) => {
            const next = new Set(readLocal());
            if (ids.has(id)) next.delete(id);
            else next.add(id);
            ids = next;
            try {
                localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
            } catch {
                // Storage can be unavailable (private mode, blocked); the toggle still works for this view.
            }
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

let localWishlist: WishlistAdapter | null = null;
const getLocalWishlist = () => (localWishlist ??= createLocalWishlist());

export const WishlistContext = createContext<WishlistAdapter | null>(null);

/** Whether the project is saved, whether a change is on its way, and the toggle. */
export function useWishlisted(project: WishlistProject): { saved: boolean; pending: boolean; toggle: () => void; shared: boolean } {
    const host = useContext(WishlistContext);
    const store = host ?? getLocalWishlist();
    const saved = useSyncExternalStore(store.subscribe, () => store.has(project.id), () => false);
    const [pending, setPending] = useState(false);
    const { id, name, detailUrl } = project;
    const toggle = useCallback(() => {
        if (pending) return;
        let result: void | Promise<void>;
        try {
            result = store.toggle({ id, name, detailUrl });
        } catch {
            return;
        }
        if (result && typeof result.then === "function") {
            setPending(true);
            // The host reports failures to the visitor (e.g. "please sign in"); the heart follows its state.
            result.catch(() => {}).finally(() => setPending(false));
        }
    }, [store, pending, id, name, detailUrl]);
    return { saved, pending, toggle, shared: host !== null };
}
