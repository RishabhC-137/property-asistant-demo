import type { PropertyCard as PropertyCardData } from "@property-assistant/contracts";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KnownUser } from "../components/AskPanel.js";
import { Icon } from "../icons/Icon.js";
import type { IconName } from "../icons/types.js";
import { formatMonthYear, formatPriceRangeShort } from "../lib/format.js";

/**
 * Where "Send to yourself" posts (the host website's share endpoint, e.g.
 * "https://site.example/api/share/send"), and who is signed in there. Without an
 * endpoint the sheet offers only "Send to others".
 */
export interface ShareOptions {
    endpoint?: string;
    user?: KnownUser;
}

export const ShareContext = createContext<ShareOptions>({});

/** The message a shared project sends: name, price, place, key facts and its page link. */
export function shareText(card: PropertyCardData): string {
    const place = [card.location.localityName, card.location.city].filter(Boolean).join(", ");
    const configs = [...new Set(card.configurations.map((c) => c.label))].join(", ");
    const possession = formatMonthYear(card.possessionDate);
    const lines = [
        `${card.name}${card.developer ? ` by ${card.developer.name}` : ""}`,
        `Price: ${formatPriceRangeShort(card.price)}`,
        place && `Location: ${place}`,
        configs && `Configurations: ${configs}`,
        possession && `Possession: ${possession}`,
        card.reraId && `RERA: ${card.reraId}`,
    ].filter(Boolean);
    return card.detailUrl ? `${lines.join("\n")}\n\n${card.detailUrl}` : lines.join("\n");
}

type Channel = "whatsapp" | "email" | "sms";
type Mode = "self" | "others";
type Step = "enter" | "code" | "profile" | "sent";

const CHANNELS: Array<{ key: Channel; label: string; icon: IconName; self: string; others: string }> = [
    { key: "whatsapp", label: "WhatsApp", icon: "whatsapp", self: "From our business WhatsApp to your number", others: "Pick a chat in WhatsApp" },
    { key: "email", label: "Email", icon: "mail", self: "To your inbox, with photos and a price table", others: "Opens your email app" },
    { key: "sms", label: "SMS", icon: "message", self: "A text message to your phone", others: "Opens Messages on your phone" },
];

const othersHref = (channel: Channel, text: string, subject: string) =>
    channel === "whatsapp"
        ? `https://wa.me/?text=${encodeURIComponent(text)}`
        : channel === "email"
          ? `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
          : `sms:?&body=${encodeURIComponent(text)}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+?91)?0?[6-9]\d{9}$|^\+\d{8,15}$/;

interface ShareReply {
    success?: boolean;
    error?: string;
    message?: string;
    note?: string;
    sent?: boolean;
    needsCode?: boolean;
    needsProfile?: boolean;
    proof?: string;
    fields?: string[];
}

/**
 * A Share button that opens a sheet over the chat. "Send to others" opens the
 * visitor's own WhatsApp, email or Messages with the details filled in (or copies
 * them). "Send to yourself" asks the host website to send the full details from
 * the business number or email: the number or email is confirmed with a code, and
 * a new visitor gives their name (and email, for a phone) to create their account.
 */
/** `label` shows text beside the icon (e.g. "Share"); without it the button is icon-only. */
export function ShareButton({ card, label }: { card: PropertyCardData; label?: string }) {
    const { endpoint, user } = useContext(ShareContext);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode | null>(endpoint ? null : "others");
    const [channel, setChannel] = useState<Channel | null>(null);
    const [copied, setCopied] = useState(false);
    const [to, setTo] = useState("");
    const [code, setCode] = useState("");
    const [name, setName] = useState(user?.name ?? "");
    const [email, setEmail] = useState("");
    const [proof, setProof] = useState<string | null>(null);
    const [fields, setFields] = useState<string[]>([]);
    const [step, setStep] = useState<Step>("enter");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const sheet = useRef<HTMLDivElement>(null);
    // The sheet covers the whole chat, not just this card.
    const host = open ? (button.current?.closest(".rec-chat") as HTMLElement | null) : null;
    const text = shareText(card);
    const isEmail = channel === "email";
    const valid = isEmail ? EMAIL_RE.test(to.trim()) : PHONE_RE.test(to.replace(/[\s()-]/g, ""));

    const resetFlow = () => {
        setStep("enter");
        setCode("");
        setProof(null);
        setStatus(null);
        setNote(null);
    };
    const close = () => {
        setOpen(false);
        setMode(endpoint ? null : "others");
        setChannel(null);
        setCopied(false);
        resetFlow();
        button.current?.focus();
    };
    const pick = (value: Channel) => {
        setChannel(value);
        setTo((value === "email" ? user?.email : user?.phone) ?? "");
        resetFlow();
    };
    const back = () => {
        if (channel) setChannel(null);
        else setMode(null);
        resetFlow();
    };

    useEffect(() => {
        if (!open) return;
        sheet.current?.querySelector<HTMLElement>("button, a, input")?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, mode, channel, step]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    const send = async (extra: Record<string, string> = {}) => {
        if (!endpoint || !channel) return;
        setBusy(true);
        setStatus(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: card.id, channel, to: to.trim(), place: card.location.localityName ?? "", ...extra }),
            });
            const data = (await res.json().catch(() => ({}))) as ShareReply;
            if (!res.ok || data.success === false) {
                setStatus({ tone: "error", text: data.error ?? "We could not send it. Please try again." });
            } else if (data.needsCode) {
                setStep("code");
                setCode("");
                setStatus({ tone: "info", text: data.message ?? "We sent you a code." });
            } else if (data.needsProfile && data.proof) {
                setStep("profile");
                setProof(data.proof);
                setFields(data.fields ?? ["name"]);
                setStatus({ tone: "info", text: data.message ?? "Tell us your name." });
            } else if (data.sent) {
                setStep("sent");
                setStatus({ tone: "success", text: data.message ?? "Details sent." });
                setNote(data.note ?? null);
            }
        } catch {
            setStatus({ tone: "error", text: "We could not reach the website. Please try again." });
        } finally {
            setBusy(false);
        }
    };

    const profileValid = name.trim().length >= 2 && (!fields.includes("email") || EMAIL_RE.test(email.trim()));

    return (
        <>
            <button
                ref={button}
                type="button"
                className={label ? "rec-card__share rec-card__share--labelled" : "rec-card__share"}
                aria-haspopup="dialog"
                aria-label={`Share ${card.name}`}
                title="Share"
                onClick={() => setOpen(true)}
            >
                <Icon name="share" size={label ? 13 : 15} />
                {label && <span>{label}</span>}
            </button>
            {open &&
                host &&
                createPortal(
                    <div className="rec-share" onClick={close}>
                        <div
                            ref={sheet}
                            className="rec-share__sheet"
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Share ${card.name}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="rec-share__header">
                                {endpoint && mode && step !== "sent" ? (
                                    <button type="button" className="rec-share__back" onClick={back}>
                                        <Icon name="chevronLeft" size={14} /> {channel ? (mode === "self" ? "Send to yourself" : "Send to others") : "All options"}
                                    </button>
                                ) : (
                                    <h3 className="rec-share__title">Share {card.name}</h3>
                                )}
                                <button type="button" className="rec-icon-button" aria-label="Close" onClick={close}>
                                    <Icon name="close" size={16} />
                                </button>
                            </div>

                            {!mode && (
                                <ul className="rec-share__options">
                                    <li>
                                        <button type="button" className="rec-share__option rec-share__option--self" onClick={() => setMode("self")}>
                                            <span className="rec-share__icon">
                                                <Icon name="user" size={18} />
                                            </span>
                                            <span>
                                                <strong>Send to yourself</strong>
                                                <small>We send the full details, photos and prices to you</small>
                                            </span>
                                        </button>
                                    </li>
                                    <li>
                                        <button type="button" className="rec-share__option" onClick={() => setMode("others")}>
                                            <span className="rec-share__icon">
                                                <Icon name="share" size={18} />
                                            </span>
                                            <span>
                                                <strong>Send to others</strong>
                                                <small>Share from your own WhatsApp, email or messages</small>
                                            </span>
                                        </button>
                                    </li>
                                </ul>
                            )}

                            {mode === "others" && (
                                <>
                                    <pre className="rec-share__preview">{text}</pre>
                                    <ul className="rec-share__options">
                                        {CHANNELS.map((option) => (
                                            <li key={option.key}>
                                                <a
                                                    className={`rec-share__option rec-share__option--${option.key}`}
                                                    href={othersHref(option.key, text, card.name)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={close}
                                                >
                                                    <span className="rec-share__icon">
                                                        <Icon name={option.icon} size={18} />
                                                    </span>
                                                    <span>
                                                        <strong>{option.label}</strong>
                                                        <small>{option.others}</small>
                                                    </span>
                                                </a>
                                            </li>
                                        ))}
                                        <li>
                                            <button type="button" className="rec-share__option rec-share__option--copy" onClick={copy}>
                                                <span className="rec-share__icon">
                                                    <Icon name={copied ? "check" : "copy"} size={18} />
                                                </span>
                                                <span>
                                                    <strong>{copied ? "Copied" : "Copy details"}</strong>
                                                    <small>{copied ? "Paste them anywhere" : "Copies the message and link"}</small>
                                                </span>
                                            </button>
                                        </li>
                                    </ul>
                                </>
                            )}

                            {mode === "self" && !channel && (
                                <ul className="rec-share__options">
                                    {CHANNELS.map((option) => (
                                        <li key={option.key}>
                                            <button type="button" className={`rec-share__option rec-share__option--${option.key}`} onClick={() => pick(option.key)}>
                                                <span className="rec-share__icon">
                                                    <Icon name={option.icon} size={18} />
                                                </span>
                                                <span>
                                                    <strong>{option.label}</strong>
                                                    <small>{option.self}</small>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {mode === "self" && channel && (
                                <form
                                    className="rec-share__form"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (step === "enter" && valid) void send();
                                        else if (step === "code" && code.length === 6) void send({ code });
                                        else if (step === "profile" && proof && profileValid)
                                            void send({ proof, name: name.trim(), ...(fields.includes("email") ? { email: email.trim() } : {}) });
                                    }}
                                >
                                    {step === "enter" && (
                                        <>
                                            <p className="rec-share__hint">
                                                {isEmail
                                                    ? "Your email. If it is not confirmed yet, we send a code first."
                                                    : `Your mobile number. If it is not confirmed yet, we send a code on WhatsApp first, then the details ${channel === "sms" ? "by SMS" : "on WhatsApp"}.`}
                                            </p>
                                            <input
                                                className="rec-share__input"
                                                type={isEmail ? "email" : "tel"}
                                                inputMode={isEmail ? "email" : "tel"}
                                                autoComplete={isEmail ? "email" : "tel"}
                                                placeholder={isEmail ? "you@example.com" : "98765 43210"}
                                                value={to}
                                                onChange={(e) => setTo(e.target.value)}
                                            />
                                            <button type="submit" className="rec-share__submit" disabled={!valid || busy}>
                                                {busy ? "Sending…" : "Send to me"}
                                            </button>
                                        </>
                                    )}
                                    {step === "code" && (
                                        <>
                                            <input
                                                className="rec-share__input"
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
                                                maxLength={6}
                                                placeholder="6-digit code"
                                                value={code}
                                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                            />
                                            <button type="submit" className="rec-share__submit" disabled={code.length !== 6 || busy}>
                                                {busy ? "Checking…" : "Confirm and send"}
                                            </button>
                                            <button type="button" className="rec-share__link" onClick={resetFlow}>
                                                Use another {isEmail ? "email" : "number"} or get a new code
                                            </button>
                                        </>
                                    )}
                                    {step === "profile" && (
                                        <>
                                            <input
                                                className="rec-share__input"
                                                autoComplete="name"
                                                placeholder="Your full name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                            />
                                            {fields.includes("email") && (
                                                <input
                                                    className="rec-share__input"
                                                    type="email"
                                                    autoComplete="email"
                                                    placeholder="Your email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                />
                                            )}
                                            <button type="submit" className="rec-share__submit" disabled={!profileValid || busy}>
                                                {busy ? "Creating…" : "Create account and send"}
                                            </button>
                                        </>
                                    )}
                                </form>
                            )}

                            {status && (
                                <p className={`rec-share__status rec-share__status--${status.tone}`} role="status">
                                    <Icon name={status.tone === "error" ? "alert" : status.tone === "success" ? "check" : "info"} size={15} /> {status.text}
                                </p>
                            )}
                            {note && (
                                <p className="rec-share__status rec-share__status--info" role="status">
                                    <Icon name="info" size={15} /> {note}
                                </p>
                            )}
                        </div>
                    </div>,
                    host,
                )}
        </>
    );
}
