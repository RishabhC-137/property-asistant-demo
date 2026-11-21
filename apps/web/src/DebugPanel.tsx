import type { ChatDebugEvent } from "@property-assistant/chat-ui";

export interface LoggedEvent {
    seq: number;
    event: ChatDebugEvent;
}

const NAME_CLASS: Record<string, string> = {
    "message.started": "started",
    "text.delta": "delta",
    block: "block",
    "message.completed": "completed",
    "message.error": "error",
    "http.error": "error",
};

/** Raw view of every request and SSE event, newest first. */
export function DebugPanel({ events, onClear }: { events: LoggedEvent[]; onClear: () => void }) {
    const counts = events.reduce<Record<string, number>>((acc, { event }) => {
        acc[event.name] = (acc[event.name] ?? 0) + 1;
        return acc;
    }, {});

    return (
        <section className="panel debug">
            <header className="panel__header">
                <h2>SSE event log</h2>
                <button type="button" onClick={onClear} disabled={events.length === 0}>
                    Clear
                </button>
            </header>
            <p className="hint">
                {Object.keys(counts).length === 0
                    ? "Send a message to see requests and streamed events here."
                    : Object.entries(counts)
                          .map(([name, n]) => `${name} ×${n}`)
                          .join(" · ")}
            </p>
            <ol className="debug__list">
                {[...events].reverse().map(({ seq, event }) => (
                    <li key={seq} className={`debug__item debug__item--${NAME_CLASS[event.name] ?? "out"}`}>
                        <div className="debug__meta">
                            <span className="debug__dir">{event.direction === "out" ? "→" : "←"}</span>
                            <strong>{event.name}</strong>
                            <time>{event.at.slice(11, 23)}</time>
                        </div>
                        <pre>{JSON.stringify(event.data, null, 2)}</pre>
                    </li>
                ))}
            </ol>
        </section>
    );
}
