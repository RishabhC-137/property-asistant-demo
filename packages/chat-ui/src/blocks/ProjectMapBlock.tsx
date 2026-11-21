import { Icon } from "../icons/Icon.js";
import { declineLocation, distanceFrom, formatDistance, requestLocation, useUserLocation } from "../lib/userLocation.js";
import type { BlockProps } from "./types.js";
import { Loader } from "../components/TypingDots.js";

/** Span of the embedded map around the project (degrees), about 2.5 km across. */
const SPAN = { lat: 0.008, lng: 0.012 };

/**
 * A project on an OpenStreetMap embed (free, no key). The viewer is asked
 * whether to use their location; if they agree, the distance is worked out
 * on their device. If they decline, the map simply shows the project.
 */
export function ProjectMapBlock({ block }: BlockProps<"project_map">) {
    const { projectName, coordinates: at, address } = block.data;
    const user = useUserLocation();
    const km = distanceFrom(user, at);

    const bbox = [at.lng - SPAN.lng, at.lat - SPAN.lat, at.lng + SPAN.lng, at.lat + SPAN.lat].map((n) => n.toFixed(5)).join(",");
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${at.lat},${at.lng}`;
    const place = `https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`;
    const directions =
        user.status === "shared" && user.position
            ? `https://www.google.com/maps/dir/?api=1&origin=${user.position.lat},${user.position.lng}&destination=${at.lat},${at.lng}`
            : null;

    return (
        <section className="rec-block rec-map">
            <header className="rec-block__header">
                <h3>Location · {projectName}</h3>
            </header>
            {address && (
                <p className="rec-muted rec-small">
                    <Icon name="location" size={13} /> {address}
                </p>
            )}
            <div className="rec-map__frame">
                <iframe title={`Map of ${projectName}`} src={embed} loading="lazy" referrerPolicy="no-referrer" />
            </div>

            <div className="rec-map__distance rec-small" aria-live="polite">
                {user.status === "unknown" && (
                    <>
                        <p>How far is it from you?</p>
                        <div className="rec-map__actions">
                            <button type="button" className="rec-button rec-button--primary rec-button--small" onClick={requestLocation}>
                                Use my location
                            </button>
                            <button type="button" className="rec-button rec-button--ghost rec-button--small" onClick={declineLocation}>
                                Not now
                            </button>
                        </div>
                        <p className="rec-muted">Your location stays on this device.</p>
                    </>
                )}
                {user.status === "asking" && <Loader label="Getting your location" />}
                {km !== null && (
                    <p>
                        About <strong>{formatDistance(km)}</strong> from you <span className="rec-muted">(straight line)</span>
                    </p>
                )}
                {user.status === "declined" && (
                    <p className="rec-muted">
                        Showing the project's location.{" "}
                        <button type="button" className="rec-link-button" onClick={requestLocation}>
                            Use my location
                        </button>
                    </p>
                )}
                {user.status === "unavailable" && (
                    <p className="rec-muted">Your location isn't available, so the map shows the project only.</p>
                )}
            </div>

            <div className="rec-map__links rec-small">
                <a href={place} target="_blank" rel="noopener noreferrer">
                    Open in Google Maps
                </a>
                {directions && (
                    <a href={directions} target="_blank" rel="noopener noreferrer">
                        Directions
                    </a>
                )}
            </div>
        </section>
    );
}
