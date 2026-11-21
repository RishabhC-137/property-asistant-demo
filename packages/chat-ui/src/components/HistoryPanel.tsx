import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons/Icon.js";
import type { ConversationSummary } from "../state/useChat.js";
import { Loader } from "./TypingDots.js";

interface HistoryPanelProps {
    currentId: string | null;
    load: () => Promise<ConversationSummary[]>;
    onOpen: (conversationId: string) => void;
    onNewChat: () => void;
    onClose: () => void;
    /** Deletes a conversation for good; the list asks the visitor to confirm first. */
    onDelete?: (conversationId: string) => Promise<void>;
    /** A phone number to call; shows a Call button beside "New chat". */
    phone?: string;
}

/** "+91-96-2500-5900" → "tel:+919625005900". */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "Previous 7 days", "Earlier": how chat apps group a history list. */
function group(at: string, now = Date.now()): string {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const time = new Date(at).getTime();
    if (time >= start.getTime()) return "Today";
    if (time >= start.getTime() - DAY) return "Yesterday";
    if (time >= start.getTime() - 7 * DAY) return "Previous 7 days";
    return "Earlier";
}

function timeLabel(at: string): string {
    const date = new Date(at);
    return group(at) === "Today"
        ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Past conversations, like a chat app's sidebar: tap one to carry on where it left off. */
export function HistoryPanel({ currentId, load, onOpen, onNewChat, onClose, onDelete, phone }: HistoryPanelProps) {
    const [items, setItems] = useState<ConversationSummary[] | null>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    // The chat waiting for "Delete" to be confirmed, and that request while it runs.
    const [confirming, setConfirming] = useState<ConversationSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (confirming) cancelRef.current?.focus();
    }, [confirming]);

    const askDelete = (item: ConversationSummary) => {
        setDeleteError(null);
        setConfirming(item);
    };
    const cancelDelete = () => {
        if (deleting) return;
        setConfirming(null);
        setDeleteError(null);
    };
    const confirmDelete = async () => {
        if (!confirming || !onDelete) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await onDelete(confirming.id);
            setItems((list) => list?.filter((e) => e.id !== confirming.id) ?? list);
            setConfirming(null);
        } catch {
            setDeleteError("Couldn't delete this chat. Check your connection and try again.");
        } finally {
            setDeleting(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        load().then((list) => !cancelled && setItems(list), () => !cancelled && setItems([]));
        closeRef.current?.focus();
        return () => {
            cancelled = true;
        };
    }, [load]);

    const groups: Array<{ label: string; items: ConversationSummary[] }> = [];
    for (const item of items ?? []) {
        const label = group(item.at);
        const last = groups.at(-1);
        if (last?.label === label) last.items.push(item);
        else groups.push({ label, items: [item] });
    }

    return (
        <>
        {/* The chat stays visible on the right, dimmed; a tap there closes the list. */}
        <div className="rec-history-backdrop" onClick={onClose} aria-hidden="true" />
        <div className="rec-history" role="dialog" aria-label="Your chats" onKeyDown={(e) => e.key === "Escape" && (confirming ? cancelDelete() : onClose())}>
            <div className="rec-history__top">
                <h3>Your chats</h3>
                <button ref={closeRef} type="button" className="rec-icon-button" onClick={onClose} aria-label="Close chat history">
                    <Icon name="close" size={18} />
                </button>
            </div>
            <button type="button" className="rec-button rec-button--primary rec-history__new" onClick={onNewChat}>
                <Icon name="newChat" size={16} /> New chat
            </button>
            <div className="rec-history__list">
                {items === null && <Loader label="Loading your chats" className="rec-loader--center" />}
                {items?.length === 0 && <p className="rec-muted rec-center rec-small">Your conversations will show up here.</p>}
                {groups.map(({ label, items: list }) => (
                    <section key={label}>
                        <h4 className="rec-history__group">{label}</h4>
                        <ul>
                            {list.map((item) => (
                                <li key={item.id} className="rec-history__row">
                                    <button
                                        type="button"
                                        className="rec-history__item"
                                        aria-current={item.id === currentId ? "true" : undefined}
                                        onClick={() => onOpen(item.id)}
                                    >
                                        <span className="rec-history__title">{item.title || "New conversation"}</span>
                                        <span className="rec-history__time">{timeLabel(item.at)}</span>
                                    </button>
                                    {onDelete && (
                                        <button
                                            type="button"
                                            className="rec-history__delete"
                                            onClick={() => askDelete(item)}
                                            aria-label={`Delete chat: ${item.title || "New conversation"}`}
                                            title="Delete chat"
                                        >
                                            <Icon name="trash" size={15} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            {/* Pinned to the bottom of the sidebar, below the list. */}
            {phone && (
                <a className="rec-history__call" href={telHref(phone)} aria-label={`Call us on ${phone}`} title={`Call ${phone}`}>
                    <Icon name="phone" size={16} /> Call us
                </a>
            )}
        </div>
        {/* Over the whole chat, not just the drawer, so the warning sits in the middle. */}
            {confirming && (
                <div className="rec-history__confirm" role="alertdialog" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), cancelDelete())} onClick={(e) => e.target === e.currentTarget && cancelDelete()} aria-modal="true" aria-labelledby="rec-delete-title" aria-describedby="rec-delete-text">
                    <div className="rec-history__confirm-card">
                        <span className="rec-history__confirm-icon" aria-hidden="true">
                            <Icon name="alert" size={20} />
                        </span>
                        <h4 id="rec-delete-title">Delete this chat?</h4>
                        <p id="rec-delete-text">
                            <strong>{confirming.title || "New conversation"}</strong> will be permanently deleted, with all its
                            messages. This can't be undone.
                        </p>
                        {deleteError && <p className="rec-history__confirm-error" role="alert">{deleteError}</p>}
                        <div className="rec-history__confirm-actions">
                            <button ref={cancelRef} type="button" className="rec-button" onClick={cancelDelete} disabled={deleting}>
                                Cancel
                            </button>
                            <button type="button" className="rec-button rec-button--danger" onClick={confirmDelete} disabled={deleting}>
                                <Icon name="trash" size={14} /> {deleting ? "Deleting…" : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
