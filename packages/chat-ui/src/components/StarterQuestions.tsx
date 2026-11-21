import { useState } from "react";
import { Icon } from "../icons/Icon.js";

export interface StarterStep {
    id: "purpose" | "type" | "bedrooms" | "budget" | "locality";
    question: string;
    options: string[];
}

/** What a first-time visitor is asked, one tap per question; every step can be skipped. */
export const DEFAULT_STARTER_STEPS: StarterStep[] = [
    { id: "purpose", question: "What brings you here?", options: ["Buy a home", "Invest", "Just exploring"] },
    {
        id: "type",
        question: "What kind of property?",
        // The types the website lists projects under (residential first, then plots and commercial).
        options: [
            "Apartment",
            "Builder floor",
            "Villa",
            "Independent house",
            "Penthouse",
            "Duplex",
            "Townhouse",
            "Studio apartment",
            "Plot",
            "Office space",
            "Retail shop",
        ],
    },
    { id: "bedrooms", question: "How many bedrooms?", options: ["2 BHK", "3 BHK", "4 BHK", "5 BHK+"] },
    { id: "budget", question: "Your budget?", options: ["Under ₹1.5 Cr", "₹1.5–3 Cr", "₹3–5 Cr", "₹5 Cr+"] },
    { id: "locality", question: "Preferred area?", options: ["Dwarka Expressway", "Golf Course Ext. Road", "Sohna Road", "New Metro"] },
];

type Picks = Partial<Record<StarterStep["id"], string>>;

/** Types sold without a bedroom count: the bedrooms question is skipped for them. */
export const NO_BEDROOM_TYPES: ReadonlySet<string> = new Set(["Plot", "Studio apartment", "Office space", "Retail shop"]);

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** The stepper's range: 1 BHK up to the largest homes listed. */
export const MIN_BEDROOMS = 1;
export const MAX_BEDROOMS = 10;

/** "3 BHK" and "5 BHK+" → 3 and 5; anything else → null. */
export function bedroomCount(pick: string | undefined): number | null {
    const n = pick ? Number.parseInt(pick, 10) : NaN;
    return Number.isFinite(n) ? n : null;
}

/**
 * Any number of bedrooms, not just the preset chips: − and + change it, and
 * "Use" picks it. Starts from the current pick, so a chip can be fine-tuned.
 */
function BedroomStepper({ pick, disabled, onUse }: { pick: string | undefined; disabled: boolean; onUse: (value: string) => void }) {
    const [count, setCount] = useState(() => Math.min(Math.max(bedroomCount(pick) ?? 3, MIN_BEDROOMS), MAX_BEDROOMS));
    const label = `${count} BHK`;
    return (
        <div className="rec-starter__stepper" role="group" aria-label="Choose the number of bedrooms">
            <button
                type="button"
                className="rec-starter__step-btn"
                onClick={() => setCount((n) => Math.max(MIN_BEDROOMS, n - 1))}
                disabled={disabled || count <= MIN_BEDROOMS}
                aria-label="Fewer bedrooms"
            >
                −
            </button>
            <output className="rec-starter__step-value" aria-live="polite">
                {label}
            </output>
            <button
                type="button"
                className="rec-starter__step-btn"
                onClick={() => setCount((n) => Math.min(MAX_BEDROOMS, n + 1))}
                disabled={disabled || count >= MAX_BEDROOMS}
                aria-label="More bedrooms"
            >
                +
            </button>
            <button type="button" className="rec-button rec-starter__step-use" onClick={() => onUse(label)} disabled={disabled}>
                Use {label}
            </button>
        </div>
    );
}

/** The picks as one message a person would type: "I want to invest in a 3 BHK apartment on Sohna Road, under ₹1.5 Cr." */
export function starterMessage(picks: Picks): string {
    const lead =
        picks.purpose === "Invest" ? "I want to invest in" : picks.purpose === "Just exploring" ? "I'm exploring" : "I'm looking to buy";
    const type = picks.type?.toLowerCase();
    const home =
        picks.bedrooms && !(picks.type && NO_BEDROOM_TYPES.has(picks.type))
            ? `a ${picks.bedrooms} ${type ?? "home"}`
            : type
              ? `${article(type)} ${type}`
              : picks.purpose === "Just exploring"
                ? "homes"
                : "a home";
    const place = picks.locality ? ` on ${picks.locality}` : " in Gurugram";
    const budget = !picks.budget
        ? ""
        : picks.budget.startsWith("Under")
          ? `, under ${picks.budget.slice("Under ".length)}`
          : picks.budget.endsWith("+")
            ? `, budget ${picks.budget.slice(0, -1)} or more`
            : `, budget ${picks.budget}`;
    return `${lead} ${home}${place}${budget}.`;
}

interface StarterQuestionsProps {
    steps?: StarterStep[];
    disabled: boolean;
    onDone: (message: string) => void;
}

/** A few taps instead of typing: purpose, type, bedrooms, budget, area, then one search. */
export function StarterQuestions({ steps = DEFAULT_STARTER_STEPS, disabled, onDone }: StarterQuestionsProps) {
    const [picks, setPicks] = useState<Picks>({});
    const [index, setIndex] = useState(0);

    // Bedrooms mean nothing for a plot, a studio or a commercial space.
    const visible = steps.filter((step) => !(step.id === "bedrooms" && picks.type && NO_BEDROOM_TYPES.has(picks.type)));
    const step = visible[index];
    const chosen = visible.flatMap((s) => (picks[s.id] ? [{ id: s.id, value: picks[s.id]! }] : []));

    const finish = (next: Picks) => onDone(starterMessage(next));
    const choose = (value: string) => {
        if (!step) return;
        const next = { ...picks, [step.id]: value };
        setPicks(next);
        if (index + 1 >= visible.length) finish(next);
        else setIndex(index + 1);
    };
    const skip = () => {
        if (index + 1 >= visible.length) finish(picks);
        else setIndex(index + 1);
    };

    if (!step) return null;
    return (
        <section className="rec-starter" aria-label="Quick questions">
            <div className="rec-starter__top">
                <span className="rec-starter__count">
                    {index + 1}/{visible.length}
                </span>
                <h3 className="rec-starter__question">{step.question}</h3>
                <div className="rec-starter__progress" aria-hidden="true">
                    {visible.map((s, i) => (
                        <i key={s.id} className={i <= index ? "is-done" : undefined} />
                    ))}
                </div>
            </div>
            <div className="rec-chips rec-chips--center" role="group" aria-label={step.question}>
                {step.options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className="rec-chip"
                        aria-pressed={picks[step.id] === option}
                        onClick={() => choose(option)}
                        disabled={disabled}
                    >
                        {option}
                    </button>
                ))}
            </div>
            {step.id === "bedrooms" && (
                // Keyed by the pick so the stepper starts from a chip chosen before going Back.
                <BedroomStepper key={picks.bedrooms ?? ""} pick={picks.bedrooms} disabled={disabled} onUse={choose} />
            )}
            <div className="rec-starter__footer">
                {index > 0 && (
                    <button type="button" className="rec-link-button" onClick={() => setIndex(index - 1)} disabled={disabled}>
                        <Icon name="chevronLeft" size={14} /> Back
                    </button>
                )}
                <button type="button" className="rec-link-button" onClick={skip} disabled={disabled}>
                    Skip
                </button>
                {chosen.length > 0 && (
                    <button type="button" className="rec-button rec-button--primary rec-starter__go" onClick={() => finish(picks)} disabled={disabled}>
                        Show homes <Icon name="chevronRight" size={14} />
                    </button>
                )}
            </div>
        </section>
    );
}
