import { MAX_MESSAGE_LENGTH } from "@property-assistant/contracts";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "../icons/Icon.js";

interface ComposerProps {
    placeholder: string;
    busy: boolean;
    disabled: boolean;
    validate: (text: string) => string | null;
    onSend: (text: string) => boolean;
    /** While a reply is coming, the send button becomes a stop button. */
    onStop?: () => void;
    stopping?: boolean;
    projectContext?: Array<{ id: string; name: string }>;
    onRemoveProject?: (id: string) => void;
    /** The website page the chat is on, when it can be asked about; `attached` once it is. */
    page?: { title: string; attached: boolean };
    onAttachPage?: () => void;
    onRemovePage?: () => void;
    /** Text put in the box (e.g. a quote from the page); each new `key` replaces the draft. */
    draft?: { key: number; text: string };
}

const MAX_ROWS_HEIGHT = 160;

export function Composer({
    placeholder,
    busy,
    disabled,
    validate,
    onSend,
    onStop,
    stopping = false,
    projectContext = [],
    onRemoveProject,
    page,
    onAttachPage,
    onRemovePage,
    draft,
}: ComposerProps) {
    const [text, setText] = useState("");
    const [touched, setTouched] = useState(false);
    const ref = useRef<HTMLTextAreaElement>(null);
    const inputId = useId();
    const helpId = `${inputId}-help`;
    const error = validate(text);
    const showCounter = text.length > MAX_MESSAGE_LENGTH * 0.8;

    useEffect(() => {
        if (!draft) return;
        setText(draft.text);
        const el = ref.current;
        if (!el) return;
        el.focus();
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
    }, [draft?.key]); // eslint-disable-line react-hooks/exhaustive-deps

    const attachPage = () => {
        onAttachPage?.();
        ref.current?.focus();
    };

    // Auto-grow the textarea up to a limit.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`;
        // Scroll only past the limit; otherwise rounding can show an empty scrollbar.
        el.style.overflowY = el.scrollHeight > MAX_ROWS_HEIGHT ? "auto" : "hidden";
    }, [text]);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        setTouched(true);
        if (error || busy || disabled) return;
        if (onSend(text)) {
            setText("");
            setTouched(false);
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter sends; Shift+Enter inserts a newline; ignore while composing (IME).
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <form className="rec-composer" onSubmit={submit}>
            {(projectContext.length > 0 || page) && (
                <div className="rec-composer__projects" aria-label="Attached to this message">
                    {page?.attached && (
                        <span className="rec-composer__project-pill rec-composer__page-pill" title={`Asking about this page: ${page.title}`}>
                            <Icon name="page" size={12} />
                            <span className="rec-composer__pill-text">This page{page.title ? `: ${page.title}` : ""}</span>
                            <button type="button" aria-label="Stop asking about this page" onClick={onRemovePage}><Icon name="close" size={12} /></button>
                        </span>
                    )}
                    {page && !page.attached && (
                        <button type="button" className="rec-composer__ask-page" onClick={attachPage} disabled={disabled} title={page.title ? `Ask about “${page.title}”` : undefined}>
                            <Icon name="page" size={12} /> Ask about this page
                        </button>
                    )}
                    {projectContext.map((project) => (
                        <span key={project.id} className="rec-composer__project-pill">
                            {project.name}
                            <button type="button" aria-label={`Remove ${project.name}`} onClick={() => onRemoveProject?.(project.id)}><Icon name="close" size={12} /></button>
                        </span>
                    ))}
                </div>
            )}
            <label className="rec-visually-hidden" htmlFor={inputId}>
                Message
            </label>
            <textarea
                id={inputId}
                ref={ref}
                rows={1}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                aria-invalid={touched && !!error}
                aria-describedby={helpId}
            />
            {busy && onStop ? (
                <button
                    type="button"
                    className="rec-send rec-send--stop"
                    onClick={onStop}
                    disabled={stopping}
                    aria-label={stopping ? "Stopping reply" : "Stop reply"}
                    title="Stop"
                >
                    <Icon name="stop" size={16} />
                </button>
            ) : (
                <button
                    type="submit"
                    className="rec-send"
                    disabled={!!error || busy || disabled}
                    aria-label="Send message"
                    title="Send (Enter)"
                >
                    <Icon name="send" size={18} />
                </button>
            )}
            <div id={helpId} className="rec-composer__help">
                {touched && error && text.length > 0 ? (
                    <span className="rec-danger">{error}</span>
                ) : (
                    <span className="rec-composer__disclaimer">AI replies can be wrong. Confirm prices and availability with an advisor.</span>
                )}
                {showCounter && (
                    <span className={text.length > MAX_MESSAGE_LENGTH ? "rec-danger" : "rec-muted"}>
                        {text.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                )}
            </div>
        </form>
    );
}
