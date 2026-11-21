import { useEffect, useRef, useState } from "react";
import type { GalleryCategory } from "@property-assistant/contracts";
import { Icon } from "../icons/Icon.js";
import type { BlockProps } from "./types.js";

const CATEGORY_LABELS: Record<GalleryCategory, string> = {
    exterior: "Exterior",
    interior: "Interior",
    floor_plan: "Floor plans",
    master_plan: "Master plan",
    site_plan: "Site plan",
    location: "Location",
};

/** Plans are drawings: shown whole rather than cropped like photos. */
const PLANS: ReadonlySet<GalleryCategory> = new Set(["floor_plan", "master_plan", "site_plan", "location"]);

/** One large image with a thumbnail strip; chips filter by kind when there is more than one. */
export function PropertyGalleryBlock({ block }: BlockProps<"property_gallery">) {
    const { projectName, images, detailUrl } = block.data;
    const categories = [...new Set(images.map((i) => i.category))];
    const [filter, setFilter] = useState<GalleryCategory | null>(null);
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
    const thumbs = useRef<HTMLDivElement>(null);

    const shown = filter ? images.filter((i) => i.category === filter) : images;
    const position = Math.min(index, shown.length - 1);
    const current = shown[position]!;

    // Keep the active thumbnail in view, scrolling only the strip (never the chat).
    useEffect(() => {
        const strip = thumbs.current;
        const thumb = strip?.children[position] as HTMLElement | undefined;
        if (!strip || !thumb) return;
        const left = thumb.offsetLeft - strip.offsetLeft;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth) {
            strip.scrollLeft = left + thumb.offsetWidth - strip.clientWidth;
        }
    }, [position, filter]);

    const choose = (category: GalleryCategory | null) => {
        setFilter(category);
        setIndex(0);
    };
    const markFailed = (url: string) => setFailed((s) => new Set(s).add(url));

    return (
        <section className="rec-block rec-gallery">
            <header className="rec-block__header">
                <h3>Photos · {projectName}</h3>
                <div className="rec-block__header-end">
                    <span className="rec-muted rec-small" aria-live="polite">
                        {position + 1} / {shown.length}
                    </span>
                    {shown.length > 1 && (
                        <div className="rec-pager">
                            <button
                                type="button"
                                className="rec-pager__button"
                                aria-label="Previous photo"
                                disabled={position === 0}
                                onClick={() => setIndex(position - 1)}
                            >
                                <Icon name="chevronLeft" size={16} />
                            </button>
                            <button
                                type="button"
                                className="rec-pager__button"
                                aria-label="Next photo"
                                disabled={position === shown.length - 1}
                                onClick={() => setIndex(position + 1)}
                            >
                                <Icon name="chevronRight" size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {categories.length > 1 && (
                <div className="rec-chips" role="group" aria-label="Photo type">
                    <button type="button" className="rec-chip rec-chip--toggle" aria-pressed={filter === null} onClick={() => choose(null)}>
                        All {images.length}
                    </button>
                    {categories.map((category) => (
                        <button
                            key={category}
                            type="button"
                            className="rec-chip rec-chip--toggle"
                            aria-pressed={filter === category}
                            onClick={() => choose(category)}
                        >
                            {CATEGORY_LABELS[category]} {images.filter((i) => i.category === category).length}
                        </button>
                    ))}
                </div>
            )}

            <figure className="rec-gallery__stage">
                {/* Opens the full-size image; the frame keeps one size so the reply does not jump between photos. */}
                <a
                    className="rec-gallery__frame"
                    data-fit={PLANS.has(current.category) ? "contain" : "cover"}
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open full size: ${current.alt}`}
                >
                    {failed.has(current.url) ? (
                        <span className="rec-card__placeholder rec-muted rec-small">Image unavailable</span>
                    ) : (
                        <img key={current.url} src={current.url} alt={current.alt} decoding="async" onError={() => markFailed(current.url)} />
                    )}
                </a>
                <figcaption className="rec-small">
                    {current.alt} <span className="rec-muted">· {CATEGORY_LABELS[current.category]}</span>
                </figcaption>
            </figure>

            {shown.length > 1 && (
                <div className="rec-gallery__thumbs" ref={thumbs} role="group" aria-label="All photos">
                    {shown.map((image, i) => (
                        <button
                            key={image.url}
                            type="button"
                            className="rec-gallery__thumb"
                            aria-pressed={i === position}
                            aria-label={image.alt}
                            onClick={() => setIndex(i)}
                        >
                            {!failed.has(image.url) && (
                                <img src={image.url} alt="" loading="lazy" decoding="async" onError={() => markFailed(image.url)} />
                            )}
                        </button>
                    ))}
                </div>
            )}

            {detailUrl && (
                <a className="rec-gallery__more rec-small" href={detailUrl} target="_blank" rel="noopener noreferrer">
                    More on the project page
                    <Icon name="chevronRight" size={14} />
                </a>
            )}
        </section>
    );
}
