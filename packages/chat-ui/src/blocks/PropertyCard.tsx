import type {
    CardSearchCriteria,
    MoneyRange,
    PropertyCard as PropertyCardData,
    PropertyConfiguration,
} from "@property-assistant/contracts";
import { useRef, useState } from "react";
import { Icon } from "../icons/Icon.js";
import { formatMonthYear, formatPricePerSqft, formatPriceRangeShort, formatSize } from "../lib/format.js";
import { distanceFrom, formatDistance, useUserLocation } from "../lib/userLocation.js";
import { useWishlisted } from "../lib/wishlist.js";
import { ShareButton } from "./ShareSheet.js";

const MAX_AMENITIES = 3;

function locationLabel(card: PropertyCardData): string | null {
    return [card.location.localityName, card.location.city].filter(Boolean).join(", ") || null;
}

/** Configurations are grouped by label and size unit upstream, so the pair identifies one. */
const configKey = (config: PropertyConfiguration) => `${config.label}|${config.size?.unit ?? ""}`;

/** "3 BHK" also matches 3.5 BHK units, as the search does. */
const matchesSearch = (config: PropertyConfiguration, criteria: CardSearchCriteria | null) =>
    criteria?.bedrooms != null && config.bedrooms !== null && Math.floor(config.bedrooms) === criteria.bedrooms;

const lowestPrice = (config: PropertyConfiguration) => config.price?.min ?? config.price?.max ?? Infinity;

type BudgetFit = "within" | "over" | "under";

const BUDGET_LABELS: Record<BudgetFit, string> = {
    within: "Within budget",
    over: "Over budget",
    under: "Below your range",
};

/**
 * Same rule as the search: a price fits when its cheapest unit is within the
 * ceiling and its dearest is above the floor. Null when no budget was searched
 * or the price is unknown.
 */
function budgetFit(price: MoneyRange | null | undefined, criteria: CardSearchCriteria | null): BudgetFit | null {
    if (criteria?.budgetMaxInr == null && criteria?.budgetMinInr == null) return null;
    const low = price?.min ?? price?.max;
    const high = price?.max ?? price?.min;
    if (low == null || high == null) return null;
    if (criteria.budgetMaxInr != null && low > criteria.budgetMaxInr) return "over";
    if (criteria.budgetMinInr != null && high < criteria.budgetMinInr) return "under";
    return "within";
}

function BudgetTag({ fit }: { fit: BudgetFit | null }) {
    if (!fit) return null;
    return <span className={`rec-card__budget rec-card__budget--${fit}`}>{BUDGET_LABELS[fit]}</span>;
}

/** Status colours: green when ready, amber while building, the brand colour for launches. */
function statusTone(status: string): string {
    if (/ready/i.test(status)) return "ready";
    if (/construct/i.test(status)) return "building";
    if (/launch/i.test(status)) return "launch";
    return "default";
}

/**
 * The card's photos, swiped (or scrolled) one at a time inside the fixed
 * frame. Arrows show on hover where there is a mouse; dots show position.
 * Photos that fail to load drop out; with none left, a placeholder shows.
 */
function CardPhotos({ card }: { card: PropertyCardData }) {
    const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
    const [index, setIndex] = useState(0);
    const strip = useRef<HTMLDivElement>(null);
    // Cards stored before photos existed have only the cover image.
    const source = card.photos?.length ? card.photos : card.image?.url ? [{ url: card.image.url, alt: card.image.alt }] : [];
    const photos = source.filter((p) => !failed.has(p.url));

    if (photos.length === 0) {
        return (
            <div className="rec-card__placeholder">
                <Icon name="building" size={24} />
            </div>
        );
    }
    const onScroll = () => {
        const el = strip.current;
        if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
    };
    const go = (to: number) => {
        const el = strip.current;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el?.scrollTo({ left: to * el.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    };
    return (
        <>
            <div className="rec-card__photos" ref={strip} onScroll={onScroll} aria-label={`Photos of ${card.name}`}>
                {photos.map((photo, i) => (
                    <img
                        key={photo.url}
                        src={photo.url}
                        alt={photo.alt}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        onError={() => setFailed((s) => new Set(s).add(photo.url))}
                    />
                ))}
            </div>
            {photos.length > 1 && (
                <>
                    <button
                        type="button"
                        className="rec-card__photo-nav rec-card__photo-nav--prev"
                        aria-label="Previous photo"
                        disabled={index <= 0}
                        onClick={() => go(index - 1)}
                    >
                        <Icon name="chevronLeft" size={16} />
                    </button>
                    <button
                        type="button"
                        className="rec-card__photo-nav rec-card__photo-nav--next"
                        aria-label="Next photo"
                        disabled={index >= photos.length - 1}
                        onClick={() => go(index + 1)}
                    >
                        <Icon name="chevronRight" size={16} />
                    </button>
                    <div className="rec-card__dots" aria-hidden="true">
                        {photos.map((photo, i) => (
                            <span key={photo.url} className={i === index ? "is-active" : undefined} />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

/** "2 BHK, 3 BHK, 4 BHK" → "2, 3, 4 BHK"; mixed labels are listed as they are. */
export function configSummary(configurations: PropertyConfiguration[]): string | null {
    const labels = [...new Set([...configurations].sort((a, b) => (a.bedrooms ?? Infinity) - (b.bedrooms ?? Infinity)).map((c) => c.label))];
    if (labels.length === 0) return null;
    const bhk = labels.every((l) => / BHK$/.test(l));
    return bhk && labels.length > 1 ? `${labels.map((l) => l.replace(/ BHK$/, "")).join(", ")} BHK` : labels.join(", ");
}

interface Spec {
    icon: "bed" | "area" | "rupee" | "building" | "check";
    label: string;
    value: string;
    wide?: boolean;
}

export function PropertyCard({
    card,
    criteria = null,
    contextSelected = false,
    onToggleContext,
    onEnquire,
    busy = false,
}: {
    card: PropertyCardData;
    criteria?: CardSearchCriteria | null;
    contextSelected?: boolean;
    onToggleContext?: () => void;
    /** Asks for a callback about this project, in the chat. */
    onEnquire?: () => void;
    /** A reply is on its way; Enquire waits for it. */
    busy?: boolean;
}) {
    const [chosenKey, setChosenKey] = useState<string | null>(null);
    const wish = useWishlisted({ id: card.id, name: card.name, detailUrl: card.detailUrl });

    const location = locationLabel(card);
    const at = card.location.coordinates ?? null;
    // Shown only once the viewer has chosen to share their location (it never leaves the device).
    const km = distanceFrom(useUserLocation(), at);
    const possession = formatMonthYear(card.possessionDate);
    // Cards stored before amenities existed do not have them.
    const amenities = card.amenities ?? [];

    // The price shown is the tapped configuration, else the searched BHK, else the cheapest.
    const chosen = card.configurations.find((c) => configKey(c) === chosenKey);
    const searched = card.configurations.find((c) => matchesSearch(c, criteria));
    const primary =
        chosen ?? searched ?? [...card.configurations].sort((a, b) => lowestPrice(a) - lowestPrice(b))[0] ?? null;
    const isSelected = primary !== null && (primary === chosen || primary === searched);
    // Every configuration in one list, smallest BHK first; non-BHK types (e.g. plots) last.
    const configurations = [...card.configurations].sort(
        (a, b) => (a.bedrooms ?? Infinity) - (b.bedrooms ?? Infinity),
    );

    const primaryPrice = primary?.price ?? card.price;
    const perSqft = formatPricePerSqft(primaryPrice);
    const area = primary ? formatSize(primary.size) : null;
    const type = card.propertyTypes.slice(0, 2).join(", ") || card.category;

    // The fact grid: only what this project has.
    const candidates: Array<Omit<Spec, "value"> & { value: string | null | undefined }> = [
        { icon: "bed", label: "Configurations", value: configSummary(card.configurations) },
        { icon: "area", label: primary && configurations.length > 1 ? `Size · ${primary.label}` : "Size", value: area },
        { icon: "rupee", label: "Price per sq ft", value: perSqft?.replace(/\s*\/\s*sq\.? ?ft$/i, "") ?? null },
        { icon: "building", label: "Type", value: type },
        { icon: "check", label: "RERA", value: card.reraId, wide: true },
    ];
    const specs = candidates.filter((spec): spec is Spec => Boolean(spec.value));

    return (
        <article className="rec-card">
            <div className="rec-card__media">
                <CardPhotos card={card} />
                <div className="rec-card__badges">
                    {card.status && <span className={`rec-badge rec-badge--${statusTone(card.status)}`}>{card.status}</span>}
                    {card.source === "fixture" && <span className="rec-badge rec-badge--notice">Demo data</span>}
                </div>
                {possession && (
                    <span className="rec-badge rec-badge--date rec-card__possession">
                        <Icon name="calendar" size={11} /> Possession {possession}
                    </span>
                )}
                <button
                    type="button"
                    className="rec-card__fav"
                    aria-pressed={wish.saved}
                    aria-busy={wish.pending || undefined}
                    disabled={wish.pending}
                    aria-label={wish.saved ? `Remove ${card.name} from your wishlist` : `Add ${card.name} to your wishlist`}
                    title={wish.saved ? (wish.shared ? "In your wishlist" : "Saved in this browser") : "Add to wishlist"}
                    onClick={wish.toggle}
                >
                    <Icon name="heart" size={16} />
                </button>
            </div>

            <div className="rec-card__body">
                <div className="rec-card__head">
                    <h4 className="rec-card__title" title={card.name}>{card.name}</h4>
                    {card.developer && <p className="rec-card__developer">by {card.developer.name}</p>}
                </div>

                {(location || at) && (
                    <p className="rec-card__location">
                        <Icon name="location" size={12} />
                        <span className="rec-card__location-text" title={location ?? undefined}>
                            {location}
                            {km !== null && ` · ${formatDistance(km)} away`}
                        </span>
                        {at && (
                            <a
                                className="rec-card__map"
                                href={`https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Map
                            </a>
                        )}
                    </p>
                )}

                <div className="rec-card__primary" aria-live="polite">
                    <p className="rec-card__primary-price">{formatPriceRangeShort(primaryPrice)}</p>
                    <div className="rec-card__primary-tags">
                        {primary && (
                            <span className="rec-card__chip">
                                {primary.label}
                                {isSelected && " (Selected)"}
                            </span>
                        )}
                        <BudgetTag fit={budgetFit(primaryPrice, criteria)} />
                    </div>
                </div>

                {specs.length > 0 && (
                    <dl className="rec-card__specs">
                        {specs.map((spec) => (
                            <div key={spec.label} className={spec.wide ? "rec-card__spec rec-card__spec--wide" : "rec-card__spec"}>
                                <Icon name={spec.icon} size={13} />
                                <div>
                                    <dt>{spec.label}</dt>
                                    <dd title={spec.value}>{spec.value}</dd>
                                </div>
                            </div>
                        ))}
                    </dl>
                )}

                {configurations.length > 1 && (
                    <div>
                        <p className="rec-card__subhead">Configurations</p>
                        <ul className="rec-card__configs">
                            {configurations.map((config) => (
                                <li key={configKey(config)}>
                                    <button
                                        type="button"
                                        className="rec-card__config"
                                        aria-pressed={config === primary}
                                        aria-label={`Show ${config.label} pricing`}
                                        onClick={() => setChosenKey(configKey(config))}
                                    >
                                        <span className="rec-card__config-label">
                                            <strong>{config.label}</strong>
                                            <BudgetTag fit={budgetFit(config.price, criteria)} />
                                        </span>
                                        <span className="rec-card__config-price">{formatPriceRangeShort(config.price)}</span>
                                        {formatSize(config.size) && (
                                            <span className="rec-card__config-area">{formatSize(config.size)}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {amenities.length > 0 && (
                    <ul className="rec-card__amenities" aria-label="Amenities">
                        {amenities.slice(0, MAX_AMENITIES).map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                        {amenities.length > MAX_AMENITIES && (
                            <li title={amenities.slice(MAX_AMENITIES).join(", ")}>
                                +{amenities.length - MAX_AMENITIES} more
                            </li>
                        )}
                    </ul>
                )}

                <div className="rec-card__footer">
                    {(card.detailUrl || onEnquire) && (
                        <div className="rec-card__actions">
                            {card.detailUrl && (
                                <a className="rec-card__details" href={card.detailUrl} target="_blank" rel="noopener noreferrer">
                                    Details
                                </a>
                            )}
                            {onEnquire && (
                                <button type="button" className="rec-card__enquire" onClick={onEnquire} disabled={busy}>
                                    <Icon name="phone" size={12} /> Enquire
                                </button>
                            )}
                        </div>
                    )}
                    <div className="rec-card__more">
                        {onToggleContext && (
                            <button type="button" className={`rec-card__context${contextSelected ? " is-selected" : ""}`} aria-pressed={contextSelected} onClick={onToggleContext}>
                                <Icon name={contextSelected ? "check" : "newChat"} size={12} />
                                <span className="rec-card__label">{contextSelected ? "Added to chat" : "Ask about"}</span>
                            </button>
                        )}
                        <ShareButton card={card} label="Share" />
                    </div>
                </div>
            </div>
        </article>
    );
}
