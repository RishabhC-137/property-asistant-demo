import type { PropertyCard as Card } from "@property-assistant/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice } from "../components/Notice.js";
import { Icon } from "../icons/Icon.js";
import { PropertyCard } from "./PropertyCard.js";
import type { BlockProps } from "./types.js";
import { TypingDots } from "../components/TypingDots.js";

/** Tracks whether the row can scroll further left/right, updating on scroll and resize. */
function useScrollEdges() {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ prev: false, next: false });

    const update = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // 1px tolerance for fractional scroll positions.
        const prev = el.scrollLeft > 1;
        const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setEdges((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        update();
        el.addEventListener("scroll", update, { passive: true });
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
        observer?.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            observer?.disconnect();
        };
    }, [update]);

    return { ref, edges, update };
}

type MoreState = { loading: boolean; failed: boolean; hasMore: boolean; nextPage: number };

export function PropertyCardsBlock({ block, actions }: BlockProps<"property_cards">) {
    const { title, items, totalResults, notice } = block.data;
    // Blocks saved before `criteria` or `query` existed do not have them.
    const criteria = block.data.criteria ?? null;
    const query = block.data.query ?? null;
    const { ref, edges, update } = useScrollEdges();

    // Pages load automatically when the sentinel at the end of the row enters the viewport.
    const loadMore = actions.loadMoreProperties;
    const [extra, setExtra] = useState<Card[]>([]);
    const [more, setMore] = useState<MoreState>({
        loading: false,
        failed: false,
        hasMore: Boolean(query && loadMore && totalResults !== null && totalResults > items.length),
        nextPage: 2,
    });
    const cards = [...items, ...extra];
    useEffect(update, [cards.length, update]);

    const moreRef = useRef(more);
    moreRef.current = more;

    const fetchMore = useCallback(async () => {
        const m = moreRef.current;
        if (!query || !loadMore || m.loading || !m.hasMore) return;
        moreRef.current = { ...m, loading: true, failed: false };
        setMore((prev) => ({ ...prev, loading: true, failed: false }));
        try {
            const page = await loadMore(query, m.nextPage, items.length);
            setExtra((shown) => {
                const known = new Set([...items, ...shown].map((c) => c.id));
                return [...shown, ...page.data.filter((c) => !known.has(c.id))];
            });
            setMore((prev) => ({ loading: false, failed: false, hasMore: page.pagination.hasMore, nextPage: prev.nextPage + 1 }));
        } catch {
            setMore((prev) => ({ ...prev, loading: false, failed: true }));
        }
    }, [query, loadMore, items]);

    // Sentinel ref: auto-load when the end of the row scrolls into view.
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !more.hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0]?.isIntersecting) void fetchMore(); },
            { root: ref.current, rootMargin: "0px 200px 0px 0px", threshold: 0 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [more.hasMore, fetchMore, ref]);

    /** Scrolls by one card (its width plus the gap), so each press lands on the next card. */
    const scroll = (direction: -1 | 1) => {
        const el = ref.current;
        const card = el?.firstElementChild as HTMLElement | null;
        if (!el || !card) return;
        const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: reduceMotion ? "auto" : "smooth" });
    };

    return (
        <section className="rec-block">
            <header className="rec-block__header">
                <h3>{title}</h3>
                <div className="rec-block__header-end">
                    {totalResults !== null && (
                        <span className="rec-muted">
                            {/* Say how many are shown when it is not all of them. */}
                            {cards.length < totalResults ? `${cards.length} of ${totalResults}` : `${totalResults} ${totalResults === 1 ? "result" : "results"}`}
                        </span>
                    )}
                    {/* Pager sits outside the cards so it is not mistaken for part of one. */}
                    {(edges.prev || edges.next) && (
                        <div className="rec-pager">
                            <button
                                type="button"
                                className="rec-pager__button"
                                aria-label="Previous properties"
                                disabled={!edges.prev}
                                onClick={() => scroll(-1)}
                            >
                                <Icon name="chevronLeft" size={16} />
                            </button>
                            <button
                                type="button"
                                className="rec-pager__button"
                                aria-label="Next properties"
                                disabled={!edges.next}
                                onClick={() => scroll(1)}
                            >
                                <Icon name="chevronRight" size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </header>
            {notice && <Notice>{notice}</Notice>}
            <div className="rec-carousel">
                {/* Focusable so keyboard users can scroll the row with arrow keys. */}
                <div className="rec-cards" ref={ref} role="region" aria-label={title} tabIndex={0} data-count={cards.length}>
                    {cards.map((card) => (
                        <PropertyCard
                            key={card.id}
                            card={card}
                            criteria={criteria}
                            contextSelected={actions.isProjectContext?.(card.id) ?? false}
                            onToggleContext={actions.toggleProjectContext ? () => actions.toggleProjectContext?.({ id: card.id, name: card.name }) : undefined}
                            onEnquire={() => actions.sendMessage(`Request a callback for ${card.name}`)}
                            busy={actions.busy}
                        />
                    ))}
                    {/* Sentinel: triggers the next page load when it scrolls into view. */}
                    {more.hasMore && (
                        <div ref={sentinelRef} className="rec-sentinel" role="status" aria-label={more.loading ? "Loading more projects" : undefined}>
                            {more.loading && <TypingDots />}
                        </div>
                    )}
                    {more.failed && (
                        <button type="button" className="rec-sentinel-retry" onClick={() => void fetchMore()} aria-live="polite">
                            <Icon name="retry" size={16} />
                            <span>Couldn't load — tap to retry</span>
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}
