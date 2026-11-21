import { useState, type CSSProperties } from "react";
import { Notice } from "../components/Notice.js";
import { formatInr } from "../lib/format.js";
import type { BlockProps } from "./types.js";

const percent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/** Donut geometry in viewBox units (the chart is drawn at about 150px). */
const SIZE = 120;
const CENTER = SIZE / 2;
const OUTER = 58;
const INNER = 38;
/** Slices smaller than this share of the ring are too thin for their number. */
const MIN_LABELLED = 0.04;
/**
 * Stages are paid in order, so they are shades of the brand colour from light
 * (first) to full (last). The lightest share still clears 2:1 on the bubble in
 * both default themes; numbers and gaps keep close shades apart.
 */
const FIRST_SHADE = 40;

export interface Slice {
    index: number;
    start: number;
    end: number;
}

/**
 * Where each stage sits on the ring, clockwise from 12 o'clock in payment
 * order, as fractions of a full turn. A plan that adds up to more than 100% is
 * scaled to fit; one that adds up to less leaves the rest of the ring empty.
 */
export function planSlices(percentages: readonly number[]): Slice[] {
    const whole = Math.max(100, percentages.reduce((sum, p) => sum + p, 0));
    const slices: Slice[] = [];
    let at = 0;
    percentages.forEach((p, index) => {
        if (p <= 0) return;
        const end = at + p / whole;
        slices.push({ index, start: at, end });
        at = end;
    });
    return slices;
}

const point = (turn: number, r: number) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return `${(CENTER + r * Math.cos(angle)).toFixed(3)} ${(CENTER + r * Math.sin(angle)).toFixed(3)}`;
};

/** A ring segment; a full turn is drawn as two halves since one arc cannot close on itself. */
function arcPath(start: number, end: number): string {
    if (end - start >= 0.9999) return `${arcPath(0, 0.5)} ${arcPath(0.5, 1)}`;
    const large = end - start > 0.5 ? 1 : 0;
    return [
        `M ${point(start, OUTER)}`,
        `A ${OUTER} ${OUTER} 0 ${large} 1 ${point(end, OUTER)}`,
        `L ${point(end, INNER)}`,
        `A ${INNER} ${INNER} 0 ${large} 0 ${point(start, INNER)}`,
        "Z",
    ].join(" ");
}

/** Share of the brand colour for stage `index` of `count`. */
const shade = (index: number, count: number) =>
    count === 1 ? 100 : FIRST_SHADE + ((100 - FIRST_SHADE) * index) / (count - 1);

/** A project's payment stages as a donut in payment order, with a numbered list beside it. */
export function PaymentPlanBlock({ block }: BlockProps<"payment_plan">) {
    const { projectName, bookingAmountInr, stages, notice } = block.data;
    const [active, setActive] = useState<number | null>(null);
    const slices = planSlices(stages.map((s) => s.percentage));
    const total = stages.reduce((sum, s) => sum + s.percentage, 0);
    const focused = active === null ? null : stages[active];

    const style = (index: number) => {
        const mix = shade(index, stages.length);
        return {
            "--rec-plan-fill": `color-mix(in oklab, var(--rec-color-primary) ${mix.toFixed(1)}%, var(--rec-color-assistant-bubble))`,
            // Dark shades take the on-brand ink, light ones the body text.
            "--rec-plan-ink": mix >= 60 ? "var(--rec-color-on-primary)" : "var(--rec-color-text)",
        } as CSSProperties;
    };
    const highlight = (index: number | null) => () => setActive(index);

    return (
        <section className="rec-block rec-plan">
            <header className="rec-block__header">
                <h3>Payment plan · {projectName}</h3>
            </header>
            {bookingAmountInr !== null && (
                <p className="rec-plan__booking rec-small">
                    <span className="rec-muted">Booking amount</span> <strong>{formatInr(bookingAmountInr)}</strong>
                </p>
            )}
            <div className="rec-plan__body" onMouseLeave={highlight(null)}>
                <div className="rec-plan__chart">
                    <svg
                        viewBox={`0 0 ${SIZE} ${SIZE}`}
                        role="img"
                        aria-label={`Payment plan in ${stages.length} stages: ${stages.map((s) => `${percent(s.percentage)} ${s.stage}`).join("; ")}`}
                    >
                        <circle className="rec-plan__track" cx={CENTER} cy={CENTER} r={(OUTER + INNER) / 2} strokeWidth={OUTER - INNER} />
                        {slices.map((slice) => {
                            const mid = point((slice.start + slice.end) / 2, (OUTER + INNER) / 2).split(" ");
                            const dimmed = active !== null && active !== slice.index;
                            return (
                                <g
                                    key={slice.index}
                                    className={`rec-plan__slice${dimmed ? " is-dimmed" : ""}${active === slice.index ? " is-active" : ""}`}
                                    style={style(slice.index)}
                                    onMouseEnter={highlight(slice.index)}
                                    onClick={() => setActive((a) => (a === slice.index ? null : slice.index))}
                                >
                                    <path d={arcPath(slice.start, slice.end)} />
                                    {slice.end - slice.start >= MIN_LABELLED && (
                                        <text x={mid[0]} y={mid[1]} dy="0.35em" textAnchor="middle" aria-hidden="true">
                                            {slice.index + 1}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                    <div className="rec-plan__center" aria-hidden="true">
                        {focused ? (
                            <>
                                <strong>{percent(focused.percentage)}</strong>
                                <span>Stage {active! + 1}</span>
                            </>
                        ) : (
                            <>
                                <strong>{percent(total)}</strong>
                                <span>
                                    in {stages.length} {stages.length === 1 ? "payment" : "payments"}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                <ol className="rec-plan__stages">
                    {stages.map((s, i) => (
                        <li
                            key={i}
                            className={`rec-plan__stage${active === i ? " is-active" : ""}`}
                            style={style(i)}
                            onMouseEnter={highlight(i)}
                            onFocus={highlight(i)}
                            onBlur={highlight(null)}
                            tabIndex={0}
                        >
                            <span className="rec-plan__key" aria-hidden="true">
                                {i + 1}
                            </span>
                            <span className="rec-plan__percent">{percent(s.percentage)}</span>
                            <span className="rec-plan__label">
                                {s.stage}
                                {s.note && <span className="rec-muted"> · {s.note}</span>}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
            {notice && <Notice>{notice}</Notice>}
        </section>
    );
}
