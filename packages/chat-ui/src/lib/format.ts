import type { MoneyRange, PropertyConfiguration } from "@property-assistant/contracts";

const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");

/** 35700000 → "₹3.57 Cr", 4500000 → "₹45 L", 95000 → "₹95,000" */
export function formatInr(amount: number): string {
    if (amount >= 1e7) return `₹${trim(amount / 1e7)} Cr`;
    if (amount >= 1e5) return `₹${trim(amount / 1e5)} L`;
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Ranges never invent a bound: a null max is shown as "From …". */
export function formatPriceRange(range: MoneyRange | null | undefined): string {
    if (!range || (range.min === null && range.max === null)) return "Price on request";
    const { min, max } = range;
    if (min !== null && max !== null) return min === max ? formatInr(min) : `${formatInr(min)} – ${formatInr(max)}`;
    if (min !== null) return `From ${formatInr(min)}`;
    return `Up to ${formatInr(max!)}`;
}

export function formatPricePerSqft(range: MoneyRange | null | undefined): string | null {
    return range?.pricePerSqft ? `₹${range.pricePerSqft.toLocaleString("en-IN")}/sq ft` : null;
}

const UNIT_LABELS: Record<string, string> = { sqft: "sq. ft.", sqyd: "sq. yd.", sqm: "sq. m" };

/** { 1550, 1650, "sqft" } → "1,550 – 1,650 sq. ft." Unknown units are shown as given. */
export function formatSize(size: PropertyConfiguration["size"]): string | null {
    if (!size) return null;
    const { min, max } = size;
    const unit = UNIT_LABELS[size.unit.toLowerCase()] ?? size.unit;
    const fmt = (n: number) => n.toLocaleString("en-IN");
    if (min !== null && max !== null && min !== max) return `${fmt(min)} – ${fmt(max)} ${unit}`;
    const one = min ?? max;
    return one === null ? null : `${fmt(one)} ${unit}`;
}

/** "2031-08-31" → "31 Aug 2031" (date-only, no time-zone shift). */
export function formatDate(isoDate: string | null | undefined): string | null {
    if (!isoDate) return null;
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? ""
        : new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
}

/** Card prices: crore always to 2 decimals ("₹4.00 Cr"), lakh trimmed ("₹85 L"). */
function cardAmount(amount: number): { value: string; unit: "Cr" | "L" | null } {
    if (amount >= 1e7) return { value: (amount / 1e7).toFixed(2), unit: "Cr" };
    if (amount >= 1e5) return { value: trim(amount / 1e5), unit: "L" };
    return { value: Math.round(amount).toLocaleString("en-IN"), unit: null };
}

const withUnit = ({ value, unit }: ReturnType<typeof cardAmount>) => `₹${value}${unit ? ` ${unit}` : ""}`;

/**
 * "₹4.00 – 4.24 Cr" when both ends share a unit, "₹85 L – ₹1.20 Cr" when they
 * do not. Like `formatPriceRange`, a missing bound is never invented.
 */
export function formatPriceRangeShort(range: MoneyRange | null | undefined): string {
    if (!range || (range.min === null && range.max === null)) return "Price on request";
    const { min, max } = range;
    if (min !== null && max !== null && min !== max) {
        const low = cardAmount(min);
        const high = cardAmount(max);
        return low.unit !== null && low.unit === high.unit
            ? `₹${low.value} – ${high.value} ${low.unit}`
            : `${withUnit(low)} – ${withUnit(high)}`;
    }
    if (min !== null) return max === min ? withUnit(cardAmount(min)) : `From ${withUnit(cardAmount(min))}`;
    return `Up to ${withUnit(cardAmount(max!))}`;
}

/** "2029-10-31" → "Oct 2029" (date-only, no time-zone shift). */
export function formatMonthYear(isoDate: string | null | undefined): string | null {
    if (!isoDate) return null;
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
