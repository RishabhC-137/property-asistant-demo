import { useEffect, useState } from "react";
import { BlockView } from "../blocks/registry.js";
import { prefersReducedMotion, TypingContext } from "../blocks/typing.js";
import type { BlockActions, BlockRenderers } from "../blocks/types.js";
import { Icon } from "../icons/Icon.js";
import { formatTime } from "../lib/format.js";
import type { UiMessage } from "../state/chatReducer.js";
import { Notice } from "./Notice.js";
import { TypingDots } from "./TypingDots.js";

interface MessageBubbleProps {
    message: UiMessage;
    actions: BlockActions;
    renderers: BlockRenderers;
    onRetry: (clientMessageId: string) => void;
    /** The newest message: only it offers suggestion pills, since older ones are out of date. */
    latest: boolean;
}

/** Bouncing dots: the assistant is working on the reply. */
function TypingIndicator() {
    return (
        <span className="rec-waiting">
            <TypingDots />
            <span className="rec-visually-hidden">Assistant is typing</span>
        </span>
    );
}

/**
 * What the assistant is doing (e.g. "Searching projects…"), as a quiet line under
 * the reply so the bubble keeps just the dots. Keyed by label so each step fades in.
 */
function ActivityLine({ activity }: { activity: string | null }) {
    return (
        <div className="rec-activity" role="status">
            {activity && (
                <span key={activity} className="rec-activity__label">
                    {activity}
                </span>
            )}
        </div>
    );
}

function ErrorWithRetry({ message, onRetry, busy }: { message: UiMessage; onRetry: () => void; busy: boolean }) {
    if (!message.error) return null;
    return (
        <div className="rec-error">
            {/* Stopping is the user's choice, not a failure. */}
            <Notice tone={message.error.code === "CANCELLED" ? "notice" : "danger"}>{message.error.message}</Notice>
            {message.error.retryable && (
                <button type="button" className="rec-button rec-button--ghost" onClick={onRetry} disabled={busy}>
                    <Icon name="retry" size={15} /> Retry
                </button>
            )}
        </div>
    );
}

/**
 * Live replies appear in order, ChatGPT-style: each text block types out and
 * the blocks after it (cards, chips, forms) appear once it has finished.
 * History and replayed replies render at once. Suggestion pills sit under the
 * bubble, Gemini-style, and only on the latest reply.
 */
function AssistantBlocks({ message, actions, renderers, latest }: Omit<MessageBubbleProps, "onRetry">) {
    const animate = message.live && !prefersReducedMotion();
    /** Index of the block being revealed; everything before it is fully shown. */
    const [revealed, setRevealed] = useState(animate ? 0 : Number.POSITIVE_INFINITY);
    const blocks = message.blocks;

    // Only text types out, so any other block lets the next one through straight away.
    useEffect(() => {
        const block = blocks[revealed];
        if (block && block.type !== "text") setRevealed((r) => Math.max(r, revealed + 1));
    }, [revealed, blocks]);

    // Once stopped, nothing more is coming as far as the user is concerned.
    const streaming = message.status === "streaming" && !message.stopped;
    // After a widget (e.g. cards), more may still be coming: keep showing that the assistant is working.
    const waiting = streaming && revealed >= blocks.length && blocks.at(-1)?.type !== "text";
    const shown = (pills: boolean) =>
        blocks.slice(0, revealed + 1).map((block, index) =>
            block && (block.type === "quick_replies") === pills ? (
                <TypingContext.Provider key={index} value={{ animate, onTyped: () => setRevealed((r) => Math.max(r, index + 1)) }}>
                    <BlockView block={block} actions={actions} renderers={renderers} />
                </TypingContext.Provider>
            ) : null,
        );
    const choices = blocks.slice(0, revealed + 1).some((b) => b?.type === "quick_replies");
    // Suggested questions come once the reply has finished typing out; choices in the reply come first.
    const suggestions = !choices && revealed >= blocks.length ? message.suggestions : [];
    return (
        <>
            <div className={`rec-bubble rec-bubble--assistant${streaming ? " rec-bubble--streaming" : ""}`}>
                {shown(false)}
                {waiting && <TypingIndicator />}
            </div>
            {latest && choices && <div className="rec-pills">{shown(true)}</div>}
            {latest && suggestions.length > 0 && (
                <div className="rec-pills rec-chips" role="group" aria-label="Suggested questions">
                    {suggestions.map((q) => (
                        <button key={q} type="button" className="rec-chip" disabled={actions.busy} onClick={() => actions.sendMessage(q)}>
                            {q}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

export function MessageBubble({ message, actions, renderers, onRetry, latest }: MessageBubbleProps) {
    const retry = () => onRetry(message.clientMessageId);

    if (message.role === "user") {
        return (
            <div className={`rec-row rec-row--user rec-status--${message.status}`}>
                <div className="rec-bubble rec-bubble--user">
                    <p className="rec-text">{message.content}</p>
                </div>
                <div className="rec-meta">
                    {message.status === "sending" ? "Sending…" : formatTime(message.createdAt)}
                </div>
                {message.status === "failed" && <ErrorWithRetry message={message} onRetry={retry} busy={actions.busy} />}
            </div>
        );
    }

    const streaming = message.status === "streaming" && !message.stopped;
    return (
        <div className={`rec-row rec-row--assistant rec-status--${message.status}`}>
            <div className={`rec-avatar rec-ai-avatar${streaming ? " is-thinking" : ""}`} aria-hidden="true">
                <Icon name="bot" size={18} />
            </div>
            <div className="rec-assistant">
                {message.blocks.length > 0 && (
                    <AssistantBlocks message={message} actions={actions} renderers={renderers} latest={latest} />
                )}
                {streaming && message.blocks.length === 0 && (
                    <div className="rec-bubble rec-bubble--assistant">
                        <TypingIndicator />
                    </div>
                )}
                {streaming && <ActivityLine activity={message.activity} />}
                {message.status === "failed" && <ErrorWithRetry message={message} onRetry={retry} busy={actions.busy} />}
                {message.status === "completed" && (
                    <div className="rec-meta">
                        {formatTime(message.createdAt)}
                        {message.replayed && " · replayed"}
                    </div>
                )}
            </div>
        </div>
    );
}
