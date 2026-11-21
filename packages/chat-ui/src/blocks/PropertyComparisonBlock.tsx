import type { ComparisonAttribute, PropertyCard } from "@property-assistant/contracts";
import { Notice } from "../components/Notice.js";
import { formatDate, formatPricePerSqft, formatPriceRange } from "../lib/format.js";
import type { BlockProps } from "./types.js";

const ROWS: Record<ComparisonAttribute, { label: string; value: (card: PropertyCard) => string | null }> = {
    price: { label: "Price", value: (c) => formatPriceRange(c.price) },
    price_per_sqft: { label: "Price / sq ft", value: (c) => formatPricePerSqft(c.price) },
    configurations: { label: "Configurations", value: (c) => c.configurations.map((x) => x.label).join(", ") || null },
    possession_date: { label: "Possession", value: (c) => formatDate(c.possessionDate) },
    status: { label: "Status", value: (c) => c.status },
    developer: { label: "Developer", value: (c) => c.developer?.name ?? null },
    locality: { label: "Locality", value: (c) => c.location.localityName ?? c.location.city },
    rera_id: { label: "RERA", value: (c) => c.reraId },
};

export function PropertyComparisonBlock({ block }: BlockProps<"property_comparison">) {
    const { title, items, attributes, notice } = block.data;
    return (
        <section className="rec-block">
            <header className="rec-block__header">
                <h3>{title}</h3>
            </header>
            {notice && <Notice>{notice}</Notice>}
            <div className="rec-table-wrap" tabIndex={0} aria-label="Property comparison table. Scroll horizontally to see every property.">
                <table className="rec-table" style={{ minWidth: `${132 + items.length * 188}px` }}>
                    <colgroup>
                        <col style={{ width: 132 }} />
                        {items.map((card) => <col key={card.id} style={{ width: 188 }} />)}
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">
                                <span className="rec-visually-hidden">Attribute</span>
                            </th>
                            {items.map((card) => (
                                <th key={card.id} scope="col">
                                    {card.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {attributes.map((attribute) => (
                            <tr key={attribute}>
                                <th scope="row">{ROWS[attribute].label}</th>
                                {items.map((card) => (
                                    <td key={card.id}>{ROWS[attribute].value(card) ?? "—"}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
