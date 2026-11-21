import type {
    ClarificationBlock,
    CreateLeadRequest,
    FormField,
    Lead,
    LeadCaptureFormBlock,
    SearchCriterion,
    SiteVisitFormBlock,
} from "@property-assistant/contracts";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../icons/Icon.js";
import type { IconName } from "../icons/types.js";
import { Notice } from "./Notice.js";
import { ButtonLoader } from "./TypingDots.js";

/** A block the panel can ask through: clarifying questions or a contact form. */
export type AskBlock = ClarificationBlock | LeadCaptureFormBlock | SiteVisitFormBlock;
type FormAskBlock = LeadCaptureFormBlock | SiteVisitFormBlock;

export const isAskBlock = (block: { type: string }): block is AskBlock =>
    block.type === "clarification" || block.type === "lead_capture_form" || block.type === "site_visit_form";

/** Sends a form's details and confirms them with the code sent to the phone. */
export interface LeadActions {
    create(lead: CreateLeadRequest): Promise<Lead>;
    verify(leadId: string, otp: string): Promise<Lead>;
    resend(leadId: string): Promise<Lead>;
}

/** What the site already knows about the visitor; matching form fields start filled in. */
export interface KnownUser {
    name?: string;
    phone?: string;
    email?: string;
}

interface AskPanelProps {
    block: AskBlock;
    busy: boolean;
    /** Sends the answers to clarifying questions as the user's next message. */
    onAnswer: (text: string) => void;
    onClose: () => void;
    onCancel?: () => void;
    leads?: LeadActions;
    user?: KnownUser;
    /** The form was sent and confirmed. */
    onSent?: () => void;
}

/**
 * ChatGPT-style panel above the message box: one question or field at a time,
 * with Back, Skip and "2 of 3". Clarifying answers go into the chat; contact
 * details go only to the leads API, never into the conversation.
 */
export function AskPanel(props: AskPanelProps) {
    return props.block.type === "clarification" ? (
        <QuestionSteps {...props} block={props.block} />
    ) : (
        <FormSteps {...props} block={props.block} />
    );
}

function PanelFrame({
    step,
    title,
    onClose,
    children,
    progress,
    className,
    fieldName,
}: {
    step: string;
    title: string;
    onClose: () => void;
    children: ReactNode;
    /** A 0–1 progress value for multi-step questions and forms. */
    progress?: number;
    className?: string;
    fieldName?: string;
}) {
    const headingId = useId();
    return (
        <section className={["rec-ask", className].filter(Boolean).join(" ")} role="dialog" aria-labelledby={headingId} data-field={fieldName}>
            <header className="rec-ask__header">
                <span className="rec-muted rec-small">{step}</span>
                <button type="button" className="rec-icon-button" aria-label="Close" onClick={onClose}>
                    <Icon name="close" size={16} />
                </button>
            </header>
            {progress !== undefined && (
                <div className="rec-ask__progress" aria-hidden="true">
                    <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
                </div>
            )}
            <h3 id={headingId} className="rec-ask__title">
                {title}
            </h3>
            {children}
        </section>
    );
}

type Choice = { value: string; label: string; image?: string | null; detail?: string | null; recommended?: boolean; icon?: IconName };

/** Numbered answers; a number key picks one, like the options in ChatGPT's questions. */
function Options({ options, selected, selectedValues, maxSelections, onPick, className, heading, progressive = false }: { options: readonly Choice[]; selected: string | null; selectedValues?: ReadonlySet<string>; maxSelections?: number; onPick: (value: string) => void; className?: string; heading?: string; progressive?: boolean }) {
    const projects = className?.includes("projects") ?? false;
    const listRef = useRef<HTMLOListElement>(null);
    const [scrollEdges, setScrollEdges] = useState({ previous: false, next: false });
    const optionKey = options.map((option) => option.value).join("|");
    const initialVisible = projects && progressive ? Math.min(6, options.length) : options.length;
    const [visibleCount, setVisibleCount] = useState(initialVisible);
    const visibleOptions = projects ? options.slice(0, visibleCount) : options;
    const hasMore = visibleCount < options.length;

    useEffect(() => setVisibleCount(initialVisible), [optionKey, initialVisible]);

    useEffect(() => {
        const list = listRef.current;
        if (!projects || !list) return;
        const update = () => setScrollEdges({
            previous: list.scrollLeft > 1,
            next: list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
        });
        update();
        list.addEventListener("scroll", update, { passive: true });
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
        observer?.observe(list);
        return () => {
            list.removeEventListener("scroll", update);
            observer?.disconnect();
        };
    }, [visibleOptions.length, projects]);

    const scrollProjects = (direction: -1 | 1) => {
        const list = listRef.current;
        const card = list?.firstElementChild as HTMLElement | null;
        if (!list || !card) return;
        const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
        if (direction === 1 && !scrollEdges.next && hasMore) {
            setVisibleCount((count) => Math.min(count + 6, options.length));
            requestAnimationFrame(() => requestAnimationFrame(() => list.scrollBy({ left: card.offsetWidth + gap, behavior: "smooth" })));
            return;
        }
        list.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
    };

    const list = (
        <ol ref={projects ? listRef : undefined} className={["rec-ask__options", className].filter(Boolean).join(" ")}>
            {visibleOptions.map((option, i) => {
                const isSelected = selectedValues?.has(option.value) ?? selected === option.value;
                const selectionLimitReached = Boolean(selectedValues && maxSelections && selectedValues.size >= maxSelections && !isSelected);
                return (
                    <li key={option.value}>
                        <button
                            type="button"
                            className={`rec-ask__option${isSelected ? " is-selected" : ""}${projects ? " rec-ask__option--project" : ""}`}
                            onClick={() => onPick(option.value)}
                            disabled={selectionLimitReached}
                            aria-pressed={selectedValues ? isSelected : undefined}
                        >
                            <span className="rec-ask__key" aria-hidden="true">
                                {i + 1}
                            </span>
                            {projects && (
                                <span className="rec-ask__project-image" aria-hidden="true">
                                    {option.image ? <img src={option.image} alt="" /> : <Icon name="building" size={24} />}
                                </span>
                            )}
                            {projects ? (
                                <span className="rec-ask__option-copy">
                                    <strong>{option.label}</strong>
                                    {option.detail && <small>{option.detail}</small>}
                                </span>
                            ) : (
                                <>
                                    {option.icon && <span className="rec-ask__choice-icon"><Icon name={option.icon} size={18} /></span>}
                                    <span className="rec-ask__choice-label">{option.label}</span>
                                </>
                            )}
                            {projects && option.recommended && <span className="rec-ask__recommended">Recommended</span>}
                            {isSelected && <Icon name="check" size={15} />}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
    if (!projects) return list;
    return (
        <section className="rec-ask__project-section">
            {heading && <div className="rec-ask__project-section-heading"><strong>{heading}</strong><span>{visibleOptions.length} of {options.length}</span></div>}
            <div className="rec-ask__project-carousel">
                <button type="button" className="rec-ask__project-arrow rec-ask__project-arrow--previous" aria-label={`Previous ${heading ?? "projects"}`} disabled={!scrollEdges.previous} onClick={() => scrollProjects(-1)}>
                    <Icon name="chevronLeft" size={17} />
                </button>
                {list}
                <button type="button" className="rec-ask__project-arrow rec-ask__project-arrow--next" aria-label={`Next ${heading ?? "projects"}`} disabled={!scrollEdges.next && !hasMore} onClick={() => scrollProjects(1)}>
                    <Icon name="chevronRight" size={17} />
                </button>
            </div>
        </section>
    );
}

const pickByNumber = (e: KeyboardEvent, options: readonly Choice[], pick: (value: string) => void) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const option = options[Number(e.key) - 1];
    if (/^[1-9]$/.test(e.key) && option) {
        e.preventDefault();
        pick(option.value);
    }
};

// ---------------------------------------------------------------- clarifying questions

const ANSWER_LABEL: Record<SearchCriterion, string> = {
    budget: "Budget",
    bedrooms: "BHK",
    locality: "Area",
    property_type: "Type",
    possession: "Possession",
    project: "Project",
};

/** "Budget: ₹1–2 Cr; BHK: 3 BHK", leaving out skipped questions. */
export function answersMessage(questions: ClarificationBlock["data"]["questions"], answers: ReadonlyArray<string | null>): string {
    return questions
        .flatMap((q, i) => {
            const answer = answers[i]?.trim();
            if (!answer) return [];
            const label = q.criterion ? ANSWER_LABEL[q.criterion] : q.text.replace(/\?\s*$/, "");
            return [`${label}: ${answer}`];
        })
        .join("; ");
}

function QuestionSteps({ block, busy, onAnswer, onClose }: AskPanelProps & { block: ClarificationBlock }) {
    const { questions } = block.data;
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Array<string | null>>(() => questions.map(() => null));
    const [typed, setTyped] = useState("");
    const question = questions[index]!;
    const choices = question.options.map((label) => ({ value: label, label }));
    const last = index === questions.length - 1;

    const answer = (value: string | null) => {
        const next = answers.map((a, i) => (i === index ? value : a));
        setAnswers(next);
        setTyped("");
        if (!last) {
            setIndex(index + 1);
            return;
        }
        const text = answersMessage(questions, next);
        if (text) onAnswer(text);
        else onClose();
    };

    return (
        <PanelFrame step={`Question ${index + 1} of ${questions.length}`} title={question.text} onClose={onClose} progress={(index + 1) / questions.length}>
            <div className="rec-ask__content" onKeyDown={(e) => pickByNumber(e, choices, answer)}>
                {choices.length > 0 && <Options options={choices} selected={answers[index] ?? null} onPick={answer} />}
                <form
                    className="rec-ask__other"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (typed.trim()) answer(typed.trim());
                    }}
                >
                    <input
                        className="rec-ask__input"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder={question.options.length > 0 ? "Or type your answer" : "Type your answer"}
                        maxLength={200}
                        aria-label="Your answer"
                    />
                    <button type="submit" className="rec-button rec-button--primary rec-button--small" disabled={!typed.trim() || busy}>
                        {last ? "Send" : "Next"}
                    </button>
                </form>
                <footer className="rec-ask__footer">
                    <button type="button" className="rec-link-button" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                        Back
                    </button>
                    <button type="button" className="rec-link-button" onClick={() => answer(null)} disabled={busy}>
                        Skip
                    </button>
                </footer>
            </div>
        </PanelFrame>
    );
}

// ---------------------------------------------------------------- contact forms

/** Indian mobile numbers may be typed bare; anything else needs its +country code. */
const validPhone = (value: string) => {
    const digits = value.replace(/[\s-]/g, "");
    return /^(\+91|91|0)?[6-9]\d{9}$/.test(digits) || /^\+\d{8,15}$/.test(digits);
};

export function fieldError(field: FormField, value: string): string | null {
    const v = value.trim();
    if (!v) return field.required ? `Please enter your ${field.label.toLowerCase()}` : null;
    if (field.input === "tel" && !validPhone(v)) return "Enter a 10-digit mobile number, or include the country code";
    if (field.input === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
    if (field.name === "name" && v.length < 2) return "Please enter your name";
    return null;
}

const isoDay = (date: Date) => date.toLocaleDateString("en-CA");
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Tomorrow, the day after and the coming weekend, from `earliest` on. */
function dateChoices(earliest: string | null): Array<{ value: string; label: string }> {
    const today = new Date();
    const first = earliest && earliest > isoDay(addDays(today, 1)) ? new Date(`${earliest}T00:00`) : addDays(today, 1);
    const days = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(first, n));
    const picks = [days[0]!, days[1]!, ...days.filter((d) => d.getDay() === 6 || d.getDay() === 0)];
    const unique = [...new Map(picks.map((d) => [isoDay(d), d])).values()].slice(0, 4);
    return unique.map((d) => ({
        value: isoDay(d),
        label:
            isoDay(d) === isoDay(addDays(today, 1))
                ? "Tomorrow"
                : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    }));
}

const TIME_CHOICES = [
    { value: "10:00", label: "10:00 AM" },
    { value: "12:00", label: "12:00 PM" },
    { value: "14:00", label: "2:00 PM" },
    { value: "16:00", label: "4:00 PM" },
    { value: "18:00", label: "6:00 PM" },
];

function shown(field: FormField, value: string): string {
    if (!value) return "—";
    if (field.input === "date") return new Date(`${value}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    if (field.input === "time") return TIME_CHOICES.find((t) => t.value === value)?.label ?? value;
    if (field.input === "select") {
        const values = field.name === "projectId" ? value.split(",").filter(Boolean) : [value];
        return values.map((selected) => field.options?.find((o) => o.value === selected)?.label ?? selected).join(", ");
    }
    return value;
}

type Stage = { kind: "fields" } | { kind: "review" } | { kind: "code"; lead: Lead } | { kind: "done"; lead: Lead };

const KNOWN_FIELDS = ["name", "phone", "email"] as const;

/** Form values from what the site knows; only valid ones, so a bad value is still asked for. */
export function knownValues(fields: readonly FormField[], user: KnownUser | undefined): Record<string, string> {
    const values: Record<string, string> = {};
    for (const name of KNOWN_FIELDS) {
        const field = fields.find((f) => f.name === name);
        const value = user?.[name]?.trim().slice(0, field?.maxLength ?? 254);
        if (field && value && !fieldError(field, value)) values[name] = value;
    }
    return values;
}

function visible(field: FormField, values: Readonly<Record<string, string>>): boolean {
    return !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals;
}

const RESEND_AFTER_S = 30;

function FormSteps({ block, onClose, onCancel, leads, user, onSent }: AskPanelProps & { block: FormAskBlock }) {
    const { fields, title, submitLabel, consentText, submission } = block.data;
    const [values, setValues] = useState<Record<string, string>>(() => knownValues(fields, user));
    // Fields filled in from what the site knows are not asked again (the review still shows them).
    const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set(Object.keys(values)));
    const steps = fields.flatMap((f, i) => (visible(f, values) && !known.has(f.name) ? [i] : []));
    const [stage, setStage] = useState<Stage>({ kind: steps.length > 0 ? "fields" : "review" });
    const [index, setIndex] = useState(steps[0] ?? 0);
    const step = steps.indexOf(index);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [code, setCode] = useState("");
    const [wait, setWait] = useState(0);
    const [projectFilter, setProjectFilter] = useState("");
    const [confirmCancel, setConfirmCancel] = useState(false);
    const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const field = fields[index]!;
    const value = values[field.name] ?? "";
    const selectedProjectIds = new Set(field.name === "projectId" ? value.split(",").filter(Boolean).slice(0, 3) : []);
    const canSend = submission.mode === "api" && leads !== undefined;
    const requestClose = () => setConfirmCancel(true);

    useEffect(() => {
        inputRef.current?.focus();
    }, [index, stage.kind]);

    useEffect(() => setProjectFilter(""), [index]);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const setValue = (v: string) => {
        setValues((all) => ({ ...all, [field.name]: v }));
        setError(null);
    };
    const next = (v = value) => {
        const problem = fieldError(field, v);
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        const nextValues = { ...values, [field.name]: v };
        const nextSteps = fields.flatMap((f, i) => (visible(f, nextValues) && !known.has(f.name) ? [i] : []));
        const following = nextSteps[nextSteps.indexOf(index) + 1];
        if (following !== undefined) setIndex(following);
        else setStage({ kind: "review" });
    };
    const pick = (v: string) => {
        setValue(v);
        next(v);
    };
    const pickProject = (projectId: string) => {
        const selected = new Set(selectedProjectIds);
        if (selected.has(projectId)) selected.delete(projectId);
        else if (selected.size < 3) selected.add(projectId);
        setValue([...selected].join(","));
    };
    const edit = (i: number) => {
        const name = fields[i]!.name;
        if (known.has(name)) setKnown((k) => new Set([...k].filter((n) => n !== name)));
        setIndex(i);
        setStage({ kind: "fields" });
    };

    const request = (): CreateLeadRequest => {
        const optional = (name: string) => (values[name]?.trim() ? values[name]!.trim() : undefined);
        const visitType = values.visitType === "online_presentation" ? "online_presentation" : "site_visit";
        const selectedProjectIds = (optional("projectId") ?? "").split(",").filter(Boolean).slice(0, 3);
        return {
            requestType: block.type === "site_visit_form" ? visitType : block.data.requestType,
            projectIds: block.type === "site_visit_form" ? (selectedProjectIds.length > 0 ? selectedProjectIds : block.data.projectIds) : block.data.projectId ? [block.data.projectId] : [],
            ...(block.type === "site_visit_form" && optional("projectName") ? { projectName: optional("projectName") } : {}),
            name: values.name?.trim() ?? "",
            phone: values.phone?.trim() ?? "",
            ...(optional("email") ? { email: optional("email") } : {}),
            ...(optional("message") ? { message: optional("message") } : {}),
            ...(optional("visitDate") ? { visitDate: optional("visitDate") } : {}),
            ...(optional("visitTime") ? { visitTime: optional("visitTime") } : {}),
            ...(visitType === "site_visit" && optional("transportMode") ? { transportMode: optional("transportMode") as "cab" | "not-required" } : {}),
            ...(visitType === "online_presentation" && optional("meetingPlatform")
                ? { meetingPlatform: optional("meetingPlatform") as "google-meet" | "teams" | "zoom" }
                : {}),
        };
    };

    /** Runs a leads call, showing its error in the panel. */
    const run = async (call: () => Promise<void>) => {
        setSending(true);
        setError(null);
        try {
            await call();
        } catch (e) {
            setError((e as Error).message || "Something went wrong. Please try again.");
        } finally {
            setSending(false);
        }
    };

    if (confirmCancel) {
        return (
            <section className="rec-ask rec-ask--cancel-warning" role="alertdialog" aria-labelledby="rec-leave-title" aria-describedby="rec-leave-text">
                <span className="rec-leave__icon" aria-hidden="true">
                    <Icon name="alert" size={18} />
                </span>
                <div className="rec-leave__text">
                    <h3 id="rec-leave-title">Leave this form?</h3>
                    <p id="rec-leave-text">Your details won't be sent.</p>
                </div>
                <div className="rec-ask__cancel-actions">
                    <button type="button" className="rec-leave__stay" onClick={() => setConfirmCancel(false)} autoFocus>
                        Keep going
                    </button>
                    <button type="button" className="rec-leave__go" onClick={() => (onCancel ?? onClose)()}>
                        Leave
                    </button>
                </div>
            </section>
        );
    }

    if (stage.kind === "done") {
        return (
            <PanelFrame step="Request sent" title="Thanks, we've got your request" onClose={onClose} progress={1} className="rec-ask--complete">
                <p className="rec-ask__done">
                    <Icon name="check" size={18} /> An advisor will contact you on {stage.lead.phoneMasked}. A request is not a confirmed booking.
                </p>
                <button type="button" className="rec-button rec-button--primary rec-button--small" onClick={onClose}>
                    Done
                </button>
            </PanelFrame>
        );
    }

    if (stage.kind === "code") {
        const { lead } = stage;
        return (
            <PanelFrame step="Final step" title="Enter the code we sent you" onClose={requestClose} progress={0.92} className="rec-ask--form">
                <p className="rec-muted rec-small">We sent a 6-digit code on WhatsApp to {lead.phoneMasked}.</p>
                <form
                    className="rec-ask__other"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                            const verified = await leads!.verify(lead.leadId, code.trim());
                            setStage({ kind: "done", lead: verified });
                            onSent?.();
                        });
                    }}
                >
                    <input
                        ref={inputRef}
                        className="rec-ask__input rec-ask__code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="••••••"
                        aria-label="Code"
                    />
                    <button type="submit" className="rec-button rec-button--primary rec-button--small" disabled={code.length < 4 || sending}>
                        {sending ? <ButtonLoader label="Checking" /> : "Confirm"}
                    </button>
                </form>
                {error && <Notice tone="danger">{error}</Notice>}
                <footer className="rec-ask__footer">
                    <button type="button" className="rec-link-button" onClick={() => edit(fields.findIndex((f) => f.name === "phone"))}>
                        Change number
                    </button>
                    <button
                        type="button"
                        className="rec-link-button"
                        disabled={wait > 0 || sending}
                        onClick={() =>
                            void run(async () => {
                                setStage({ kind: "code", lead: await leads!.resend(lead.leadId) });
                                setWait(RESEND_AFTER_S);
                            })
                        }
                    >
                        {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
                    </button>
                </footer>
            </PanelFrame>
        );
    }

    if (stage.kind === "review") {
        return (
            <PanelFrame step="Almost there" title="Review your request" onClose={requestClose} progress={0.84} className="rec-ask--form">
                <dl className="rec-ask__review">
                    {fields.map((f, i) =>
                        visible(f, values) ? (
                            <div key={f.name}>
                                <dt>{f.label}</dt>
                                <dd>{shown(f, values[f.name] ?? "")}</dd>
                                <button type="button" className="rec-link-button" onClick={() => edit(i)} aria-label={`Edit ${f.label}`}>
                                    Edit
                                </button>
                            </div>
                        ) : null,
                    )}
                </dl>
                {consentText && <p className="rec-muted rec-small">{consentText}</p>}
                {error && <Notice tone="danger">{error}</Notice>}
                {submission.mode === "disabled" && <Notice>{submission.notice}</Notice>}
                <footer className="rec-ask__footer">
                    <button type="button" className="rec-link-button" onClick={() => edit(steps.at(-1) ?? fields.length - 1)}>
                        Back
                    </button>
                    <button
                        type="button"
                        className="rec-button rec-button--primary rec-button--small"
                        disabled={!canSend || sending}
                        onClick={() =>
                            void run(async () => {
                                setStage({ kind: "code", lead: await leads!.create(request()) });
                                setCode("");
                                setWait(RESEND_AFTER_S);
                            })
                        }
                    >
                        {sending ? <ButtonLoader label="Sending" /> : submitLabel}
                    </button>
                </footer>
            </PanelFrame>
        );
    }

    const choices =
        field.input === "date"
            ? dateChoices(block.type === "site_visit_form" ? block.data.earliestDate : null)
            : field.input === "time"
              ? TIME_CHOICES
              : field.input === "select"
                ? (field.options ?? [])
                : field.input === "checkbox"
                  ? [
                        { value: "yes", label: "Yes" },
                        { value: "", label: "No" },
                    ]
                  : [];
    const decoratedChoices: Choice[] = choices.map((choice) => ({
        ...choice,
        icon:
            field.name === "visitType"
                ? choice.value === "site_visit" ? "location" : "video"
                : field.name === "transportMode"
                  ? choice.value === "cab" ? "car" : "walk"
                  : field.name === "meetingPlatform"
                    ? choice.value === "google-meet"
                        ? "googleMeet"
                        : choice.value === "teams"
                          ? "microsoftTeams"
                          : "zoom"
                    : undefined,
    }));
    const matchingChoices =
        field.name === "projectId" && projectFilter.trim()
            ? decoratedChoices.filter((choice) => choice.label.toLocaleLowerCase().includes(projectFilter.trim().toLocaleLowerCase()))
            : decoratedChoices;
    const selectedProjects = field.name === "projectId"
        ? decoratedChoices.filter((choice) => selectedProjectIds.has(choice.value))
        : [];
    const minDate = isoDay(addDays(new Date(), 1));

    const hint =
        field.name === "visitType"
            ? "Choose how you would like to explore your shortlisted home."
            : field.name === "projectId"
              ? "Search and select between 1 and 3 projects."
            : field.name === "transportMode"
              ? "Complimentary pickup and drop can be arranged for your visit."
              : field.name === "meetingPlatform"
                ? "Your meeting link will be shared after confirmation."
                : null;

    return (
        <PanelFrame
            step={`${step + 1} of ${steps.length}`}
            title={field.label + (field.required ? "" : " (optional)")}
            onClose={requestClose}
            progress={(step + 1) / steps.length}
            className={block.type === "site_visit_form" || block.type === "lead_capture_form" ? "rec-ask--form" : undefined}
            fieldName={field.name}
        >
            {hint && <p className="rec-ask__hint">{hint}</p>}
            <div className="rec-ask__content" onKeyDown={(e) => pickByNumber(e, matchingChoices, field.name === "projectId" ? pickProject : pick)}>
                {field.name === "projectId" && (
                    <input
                        ref={inputRef}
                        className="rec-ask__input rec-ask__project-search"
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        placeholder="Search projects"
                        aria-label="Search projects"
                    />
                )}
                {field.name === "projectId" && matchingChoices.length > 0 && (
                    <div className="rec-ask__project-meta">
                        <span>{matchingChoices.length === choices.length ? `${choices.length} projects available` : `${matchingChoices.length} of ${choices.length} projects`}</span>
                        <span>{selectedProjectIds.size === 0 ? "Select 1–3" : `${selectedProjectIds.size} of 3 selected`}</span>
                    </div>
                )}
                {field.name === "projectId" && selectedProjects.length > 0 && (
                    <div className="rec-ask__selected-projects" aria-label="Selected projects">
                        <div className="rec-ask__selected-projects-heading">
                            <span>Selected projects</span>
                            <button type="button" className="rec-link-button" onClick={() => setValue("")}>Clear all</button>
                        </div>
                        <div className="rec-ask__selected-project-list">
                            {selectedProjects.map((project) => (
                                <button
                                    key={project.value}
                                    type="button"
                                    className="rec-ask__selected-project"
                                    onClick={() => pickProject(project.value)}
                                    aria-label={`Remove ${project.label}`}
                                >
                                    <span>{project.label}</span>
                                    <Icon name="close" size={13} />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {field.name !== "projectId" && matchingChoices.length > 0 && (
                    <Options
                        options={matchingChoices}
                        selected={field.name === "projectId" ? null : (value || null)}
                        selectedValues={field.name === "projectId" ? selectedProjectIds : undefined}
                        maxSelections={field.name === "projectId" ? 3 : undefined}
                        onPick={field.name === "projectId" ? pickProject : pick}
                        className={
                            field.name === "visitType"
                                ? "rec-ask__options--appointment"
                                : field.name === "projectId"
                                  ? "rec-ask__options--projects"
                                  : field.name === "transportMode"
                                    ? "rec-ask__options--transport"
                                    : field.name === "meetingPlatform"
                                      ? "rec-ask__options--platforms"
                                  : field.input === "date" || field.input === "time"
                                    ? "rec-ask__options--schedule"
                                    : undefined
                        }
                    />
                )}
                {field.name === "projectId" && matchingChoices.length > 0 && (
                    <Options
                        options={matchingChoices}
                        selected={null}
                        selectedValues={selectedProjectIds}
                        maxSelections={3}
                        onPick={pickProject}
                        className="rec-ask__options--projects"
                        heading="All projects"
                        progressive={!projectFilter.trim()}
                    />
                )}
                {field.name === "projectId" && matchingChoices.length === 0 && <p className="rec-ask__empty">No project matches that search.</p>}
                {field.input !== "select" && field.input !== "checkbox" && (
                    <form
                        className="rec-ask__other"
                        noValidate
                        onSubmit={(e) => {
                            e.preventDefault();
                            next();
                        }}
                    >
                        {field.input === "textarea" ? (
                            <textarea
                                ref={inputRef}
                                className="rec-ask__input"
                                rows={2}
                                value={value}
                                maxLength={field.maxLength ?? undefined}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="Anything the advisor should know"
                                aria-label={field.label}
                            />
                        ) : (
                            <input
                                ref={inputRef}
                                className="rec-ask__input"
                                type={field.input}
                                value={value}
                                maxLength={field.maxLength ?? undefined}
                                min={field.input === "date" ? minDate : undefined}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={field.input === "tel" ? "10-digit mobile number" : (field.placeholder ?? undefined)}
                                autoComplete={field.name === "name" ? "name" : field.input === "tel" ? "tel" : field.input === "email" ? "email" : undefined}
                                inputMode={field.input === "tel" ? "tel" : undefined}
                                aria-label={field.label}
                                aria-invalid={error !== null}
                            />
                        )}
                    </form>
                )}
                {error && <p className="rec-ask__error">{error}</p>}
                <footer className="rec-ask__footer">
                    <button type="button" className="rec-link-button rec-ask__nav-button" onClick={() => setIndex(steps[step - 1]!)} disabled={step <= 0}>
                        <Icon name="chevronLeft" size={15} /> Back
                    </button>
                    {!field.required && (
                        <button type="button" className="rec-link-button" onClick={() => pick("")}>
                            Skip
                        </button>
                    )}
                    {field.name === "projectId" && (
                        <button
                            type="button"
                            className="rec-button rec-button--primary rec-button--small"
                            disabled={selectedProjectIds.size === 0}
                            onClick={() => next(value)}
                        >
                            Next <Icon name="chevronRight" size={15} />
                        </button>
                    )}
                    {field.name !== "projectId" && field.input !== "select" && field.input !== "checkbox" && (
                        <button
                            type="button"
                            className="rec-button rec-button--primary rec-button--small"
                            onClick={() => next(value)}
                        >
                            Next <Icon name="chevronRight" size={15} />
                        </button>
                    )}
                </footer>
            </div>
        </PanelFrame>
    );
}
