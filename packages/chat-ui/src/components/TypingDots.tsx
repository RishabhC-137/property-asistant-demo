/** Three bouncing dots: the one loading sign used everywhere in the chat. */
export function TypingDots() {
    return (
        <span className="rec-typing" aria-hidden="true">
            <span />
            <span />
            <span />
        </span>
    );
}

/** The dots with a short label beside them ("Loading your chats"), read out to screen readers. */
export function Loader({ label, className = "" }: { label: string; className?: string }) {
    return (
        <span className={["rec-loader", className].filter(Boolean).join(" ")} role="status">
            <TypingDots />
            <span>{label}</span>
        </span>
    );
}

/** The dots alone inside a button, with the action read out to screen readers ("Sending"). */
export function ButtonLoader({ label }: { label: string }) {
    return (
        <>
            <TypingDots />
            <span className="rec-visually-hidden">{label}</span>
        </>
    );
}
