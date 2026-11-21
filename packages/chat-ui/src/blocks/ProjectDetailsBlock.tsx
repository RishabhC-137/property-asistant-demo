import type { PropertyConfiguration } from "@property-assistant/contracts";
import { useState } from "react";
import { Icon } from "../icons/Icon.js";
import { formatInr, formatMonthYear, formatPricePerSqft, formatPriceRangeShort, formatSize } from "../lib/format.js";
import { distanceFrom, formatDistance, useUserLocation } from "../lib/userLocation.js";
import { useWishlisted } from "../lib/wishlist.js";
import { configSummary } from "./PropertyCard.js";
import { ShareButton } from "./ShareSheet.js";
import type { BlockProps } from "./types.js";

/** Nearby places shown before "More details"; the rest are inside it. */
const NEARBY_UPFRONT = 3;
const AMENITIES_UPFRONT = 0;

const bySize = (a: PropertyConfiguration, b: PropertyConfiguration) => (a.bedrooms ?? Infinity) - (b.bedrooms ?? Infinity);

/** "₹17,000/sq ft" → "₹17,000"; the label says per sq ft. */
const perSqftValue = (text: string | null) => text?.replace(/\s*\/\s*sq\.? ?ft$/i, "") ?? null;

/** Size range across every configuration, in the first one's unit. */
function sizeRange(configs: PropertyConfiguration[]): string | null {
    const sized = configs.filter((c) => c.size);
    if (sized.length === 0) return null;
    const unit = sized[0]!.size!.unit;
    const same = sized.filter((c) => c.size!.unit === unit);
    const values = same.flatMap((c) => [c.size!.min, c.size!.max]).filter((n): n is number => n !== null);
    if (values.length === 0) return null;
    return formatSize({ min: Math.min(...values), max: Math.max(...values), unit });
}

/**
 * One project in depth, for "tell me about X". Laid out wide and short so it
 * reads in a small chat window: who and where with the price beside the photo,
 * the four numbers a buyer compares in one strip, the configurations, then the
 * rest behind "More details". On a phone the photo becomes a short banner.
 */
export function ProjectDetailsBlock({ block, actions }: BlockProps<"project_details">) {
    const { project: card, bookingAmountInr, nearby, loanBanks, locationAdvantages } = block.data;
    const [more, setMore] = useState(false);
    const [photoFailed, setPhotoFailed] = useState(false);
    const wish = useWishlisted({ id: card.id, name: card.name, detailUrl: card.detailUrl });
    const at = card.location.coordinates ?? null;
    const km = distanceFrom(useUserLocation(), at);

    const photo = card.photos?.[0]?.url ?? card.image?.url ?? null;
    const location = [card.location.localityName, card.location.city].filter(Boolean).join(", ") || null;
    const possession = formatMonthYear(card.possessionDate);
    const configs = [...card.configurations].sort(bySize);
    const amenities = card.amenities ?? [];
    const send = (text: string) => actions.sendMessage(text);

    const stats = [
        { label: "Configurations", value: configSummary(configs) },
        { label: "Size", value: sizeRange(configs) },
        { label: "Per sq ft", value: perSqftValue(formatPricePerSqft(card.price)) },
        { label: "Booking", value: bookingAmountInr !== null ? formatInr(bookingAmountInr) : null },
    ].filter((s): s is { label: string; value: string } => Boolean(s.value));

    const hasMore =
        nearby.length > NEARBY_UPFRONT || amenities.length > AMENITIES_UPFRONT || loanBanks.length > 0 || locationAdvantages.length > 0 || card.highlights.length > 0;

    return (
        <section className="rec-block rec-pd" aria-label={`${card.name} details`}>
            <div className="rec-pd__top">
                <div className="rec-pd__media">
                    {photo && !photoFailed ? (
                        <img src={photo} alt={card.photos?.[0]?.alt ?? card.name} decoding="async" onError={() => setPhotoFailed(true)} />
                    ) : (
                        <span className="rec-pd__placeholder" aria-hidden="true">
                            <Icon name="building" size={26} />
                        </span>
                    )}
                    <button
                        type="button"
                        className="rec-card__fav rec-pd__fav"
                        aria-pressed={wish.saved}
                        aria-busy={wish.pending || undefined}
                        disabled={wish.pending}
                        aria-label={wish.saved ? `Remove ${card.name} from your wishlist` : `Add ${card.name} to your wishlist`}
                        title={wish.saved ? (wish.shared ? "In your wishlist" : "Saved in this browser") : "Add to wishlist"}
                        onClick={wish.toggle}
                    >
                        <Icon name="heart" size={15} />
                    </button>
                </div>

                <div className="rec-pd__head">
                    <h3 className="rec-pd__name" title={card.name}>{card.name}</h3>
                    {card.developer && <p className="rec-pd__developer">by {card.developer.name}</p>}
                    {(location || at) && (
                        <p className="rec-pd__place">
                            <Icon name="location" size={12} />
                            <span className="rec-pd__place-text" title={location ?? undefined}>
                                {location}
                                {km !== null && ` · ${formatDistance(km)} away`}
                            </span>
                            {at && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}`} target="_blank" rel="noopener noreferrer">
                                    Map
                                </a>
                            )}
                        </p>
                    )}
                    <p className="rec-pd__price">{formatPriceRangeShort(card.price)}</p>
                    <div className="rec-pd__tags">
                        {card.status && <span className="rec-pd__tag rec-pd__tag--status">{card.status}</span>}
                        {possession && (
                            <span className="rec-pd__tag">
                                <Icon name="calendar" size={11} /> Possession {possession}
                            </span>
                        )}
                        {card.reraId && (
                            <span className="rec-pd__tag rec-pd__tag--rera" title={`RERA ${card.reraId}`}>
                                <Icon name="check" size={11} /> RERA
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {stats.length > 0 && (
                <dl className="rec-pd__stats" data-count={stats.length}>
                    {stats.map((s) => (
                        <div key={s.label} className="rec-pd__stat">
                            <dt>{s.label}</dt>
                            <dd title={s.value}>{s.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {configs.length > 0 && (
                <table className="rec-pd__configs">
                    <caption className="rec-pd__label">Price by configuration</caption>
                    <tbody>
                        {configs.map((c) => (
                            <tr key={`${c.label}|${c.size?.unit ?? ""}`}>
                                <th scope="row">{c.label}</th>
                                <td className="rec-pd__config-size">{formatSize(c.size) ?? "–"}</td>
                                <td className="rec-pd__config-price">{formatPriceRangeShort(c.price)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {nearby.length > 0 && (
                <div className="rec-pd__row">
                    <span className="rec-pd__label">Nearby</span>
                    <ul className="rec-pd__chips">
                        {nearby.slice(0, NEARBY_UPFRONT).map((p) => (
                            <li key={`${p.kind}|${p.name}`} title={`${p.kind}: ${p.name}`}>
                                <strong>{p.name}</strong>
                                {(p.distance || p.travelTime) && <span>{p.distance ?? p.travelTime}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {hasMore && more && (
                <div className="rec-pd__more" id={`rec-pd-more-${card.id}`}>
                    {card.highlights.length > 0 && (
                        <div>
                            <p className="rec-pd__label">Why buyers like it</p>
                            <ul className="rec-pd__list">
                                {card.highlights.map((h) => (
                                    <li key={h}>{h}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {nearby.length > NEARBY_UPFRONT && (
                        <div>
                            <p className="rec-pd__label">More nearby</p>
                            <ul className="rec-pd__chips rec-pd__chips--wrap">
                                {nearby.slice(NEARBY_UPFRONT).map((p) => (
                                    <li key={`${p.kind}|${p.name}`}>
                                        <strong>{p.name}</strong>
                                        {(p.distance || p.travelTime) && <span>{p.distance ?? p.travelTime}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {locationAdvantages.length > 0 && (
                        <div>
                            <p className="rec-pd__label">Location advantages</p>
                            <ul className="rec-pd__list">
                                {locationAdvantages.map((a) => (
                                    <li key={a}>{a}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {amenities.length > 0 && (
                        <div>
                            <p className="rec-pd__label">Amenities</p>
                            <ul className="rec-pd__chips rec-pd__chips--wrap rec-pd__chips--plain">
                                {amenities.map((a) => (
                                    <li key={a}>{a}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {loanBanks.length > 0 && (
                        <p className="rec-pd__banks">
                            <span className="rec-pd__label">Home loans</span> {loanBanks.join(", ")}
                        </p>
                    )}
                    {card.reraId && (
                        <p className="rec-pd__banks">
                            <span className="rec-pd__label">RERA</span> {card.reraId}
                        </p>
                    )}
                </div>
            )}

            <div className="rec-pd__actions">
                <button type="button" className="rec-pd__btn rec-pd__btn--primary" onClick={() => send(`Request a callback for ${card.name}`)} disabled={actions.busy}>
                    <Icon name="phone" size={13} /> Enquire
                </button>
                <button type="button" className="rec-pd__btn" onClick={() => send(`Request a site visit to ${card.name}`)} disabled={actions.busy}>
                    <Icon name="calendar" size={13} /> Site visit
                </button>
                <button type="button" className="rec-pd__btn" onClick={() => send(`Payment plan of ${card.name}`)} disabled={actions.busy}>
                    <Icon name="rupee" size={13} /> Plan
                </button>
            </div>
            <div className="rec-pd__foot">
                {hasMore && (
                    <button type="button" className="rec-pd__link" aria-expanded={more} aria-controls={`rec-pd-more-${card.id}`} onClick={() => setMore((m) => !m)}>
                        {more ? "Less details" : "More details"}
                        <Icon name={more ? "chevronUp" : "chevronRight"} size={12} />
                    </button>
                )}
                {card.detailUrl && (
                    <a className="rec-pd__link" href={card.detailUrl} target="_blank" rel="noopener noreferrer">
                        Full page <Icon name="externalLink" size={11} />
                    </a>
                )}
                <ShareButton card={card} label="Share" />
            </div>
        </section>
    );
}
