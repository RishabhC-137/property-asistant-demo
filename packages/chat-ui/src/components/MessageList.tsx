import { useEffect, useLayoutEffect, useRef } from "react";
import type { BlockActions, BlockRenderers } from "../blocks/types.js";
import { Icon } from "../icons/Icon.js";
import type { ChatState } from "../state/chatReducer.js";
import { MessageBubble } from "./MessageBubble.js";
import { StarterQuestions } from "./StarterQuestions.js";
import { ButtonLoader, Loader } from "./TypingDots.js";

interface MessageListProps {
    state: ChatState;
    actions: BlockActions;
    renderers: BlockRenderers;
    onRetry: (clientMessageId: string) => void;
    onLoadOlder: () => void;
    welcomeMessage: string;
    suggestions: string[];
}

/** Distance from the bottom (px) within which we keep following new content. */
const STICK_THRESHOLD = 120;

/** Hand-drawn strokes that slowly draw themselves behind the welcome: a skyline, a path, a sparkle. */
function WelcomeScribbles() {
    return (
        <svg className="rec-scribbles" viewBox="0 0 320 140" fill="none" aria-hidden="true">
            <path className="rec-scribbles__line" d="M8 120h40v-38h22v-22h18v60h20V70l16-14 16 14v50h24V40h26v80h18V88h24v32h40" />
            <path className="rec-scribbles__line rec-scribbles__line--2" d="M14 132c40-10 80 6 120-2s92-14 172 0" />
            <path className="rec-scribbles__line rec-scribbles__line--3" d="M270 22l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        </svg>
    );
}

export function MessageList({ state, actions, renderers, onRetry, onLoadOlder, welcomeMessage, suggestions }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    /** Distance from the bottom saved before older messages are prepended. */
    const anchorFromBottom = useRef<number | null>(null);
    const loadingOlder = state.history.loadingOlder;

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    };

    const loadOlder = () => {
        const el = scrollRef.current;
        if (el) anchorFromBottom.current = el.scrollHeight - el.scrollTop;
        onLoadOlder();
    };

    // Follow new content at the bottom; keep position when older messages are prepended.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (anchorFromBottom.current !== null) {
            if (!loadingOlder) {
                el.scrollTop = el.scrollHeight - anchorFromBottom.current;
                anchorFromBottom.current = null;
            }
        } else if (stickToBottom.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [state.messages, loadingOlder]);

    useEffect(() => {
        stickToBottom.current = true;
    }, [state.conversationId]);

    // Typed-out replies grow without a state change here, so follow DOM changes too
    // (only while the reader is at the bottom; scrolling up stops the follow).
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof MutationObserver === "undefined") return;
        const observer = new MutationObserver(() => {
            if (stickToBottom.current && anchorFromBottom.current === null) el.scrollTop = el.scrollHeight;
        });
        observer.observe(el, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
    }, []);

    const empty = state.phase === "ready" && state.messages.length === 0;

    return (
        <div className="rec-messages" ref={scrollRef} onScroll={onScroll} aria-live="polite" aria-busy={actions.busy}>
            {state.history.hasMore && (
                <button type="button" className="rec-button rec-button--ghost rec-load-older" onClick={loadOlder} disabled={loadingOlder}>
                    {loadingOlder ? <ButtonLoader label="Loading earlier messages" /> : <><Icon name="chevronUp" size={15} /> Load earlier messages</>}
                </button>
            )}

            {state.phase === "loading" && <Loader label="Loading conversation" className="rec-loader--center" />}

            {empty && (
                <div className="rec-welcome">
                    <WelcomeScribbles />
                    <div className="rec-welcome__icon rec-ai-avatar">
                        <Icon name="sparkles" size={26} />
                    </div>
                    <div className="rec-welcome__copy">
                        <span className="rec-welcome__eyebrow">PROPERTY ASSISTANT DEMO</span>
                        <p>{welcomeMessage}</p>
                    </div>
                    <StarterQuestions disabled={actions.busy} onDone={actions.sendMessage} />
                    {suggestions.length > 0 && (
                        <div className="rec-chips rec-chips--center rec-welcome__quick" aria-label="Or ask">
                            {suggestions.map((s) => (
                                <button key={s} type="button" className="rec-chip" onClick={() => actions.sendMessage(s)} disabled={actions.busy}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {state.messages.map((message, i) => (
                <MessageBubble
                    key={message.key}
                    message={message}
                    actions={actions}
                    renderers={renderers}
                    onRetry={onRetry}
                    latest={i === state.messages.length - 1}
                />
            ))}
        </div>
    );
}
