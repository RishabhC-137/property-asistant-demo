import { distanceKm, type Coordinates } from "@property-assistant/contracts";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The viewer's location, for showing how far projects are. It is read only
 * after the viewer agrees, kept in memory on this device, and never sent to
 * the server or the model. Only the viewer's choice is remembered.
 */
export type LocationStatus = "unknown" | "asking" | "shared" | "declined" | "unavailable";

export interface UserLocation {
    status: LocationStatus;
    position: Coordinates | null;
}

const CHOICE_KEY = "rec-location-choice";
const UNKNOWN: UserLocation = { status: "unknown", position: null };

let state: UserLocation = UNKNOWN;
let resumed = false;
const listeners = new Set<() => void>();

function set(next: UserLocation) {
    state = next;
    for (const listener of listeners) listener();
}

function remember(choice: "shared" | "declined") {
    try {
        localStorage.setItem(CHOICE_KEY, choice);
    } catch {
        // Private mode or blocked storage: the choice just lasts for this page.
    }
}

function storedChoice(): string | null {
    try {
        return localStorage.getItem(CHOICE_KEY);
    } catch {
        return null;
    }
}

/** Asks the browser for the location (it shows its own permission prompt the first time). */
export function requestLocation(): void {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        set({ status: "unavailable", position: null });
        return;
    }
    set({ status: "asking", position: null });
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            remember("shared");
            set({ status: "shared", position: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                remember("declined");
                set({ status: "declined", position: null });
            } else {
                set({ status: "unavailable", position: null });
            }
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
}

export function declineLocation(): void {
    remember("declined");
    set({ status: "declined", position: null });
}

/**
 * Restores an earlier choice once per page: "declined" is respected without
 * asking again, and "shared" is re-read silently if the browser still allows it.
 */
function resume(): void {
    if (resumed) return;
    resumed = true;
    const choice = storedChoice();
    if (choice === "declined") {
        set({ status: "declined", position: null });
    } else if (choice === "shared" && typeof navigator !== "undefined" && navigator.permissions?.query) {
        navigator.permissions
            .query({ name: "geolocation" })
            .then((permission) => {
                if (permission.state === "granted") requestLocation();
            })
            .catch(() => {});
    }
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function useUserLocation(): UserLocation {
    useEffect(resume, []);
    return useSyncExternalStore(subscribe, () => state, () => UNKNOWN);
}

/** "650 m", "4.2 km", "18 km": rounded, since the distance is a straight line. */
export function formatDistance(km: number): string {
    if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function distanceFrom(user: UserLocation, to: Coordinates | null | undefined): number | null {
    return user.status === "shared" && user.position && to ? distanceKm(user.position, to) : null;
}

/** For tests: forget the page's state. */
export function resetUserLocation(): void {
    resumed = false;
    set(UNKNOWN);
}
