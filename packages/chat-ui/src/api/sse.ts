/**
 * Minimal Server-Sent Events parser for `fetch()` response bodies.
 * (`EventSource` cannot send POST requests, so we parse the stream ourselves.)
 *
 * Network chunks do not line up with events, so callers keep a buffer:
 * append each chunk, parse, and carry `rest` (an incomplete event) forward.
 */
export interface RawSseEvent {
    /** Event name; "message" when the event has no `event:` field. */
    event: string;
    /** Data lines joined with "\n". */
    data: string;
    id?: string;
}

export function parseSseChunk(buffer: string): { events: RawSseEvent[]; rest: string } {
    const normalized = buffer.replace(/\r\n?/g, "\n");
    const parts = normalized.split("\n\n");
    const rest = parts.pop() ?? "";
    const events: RawSseEvent[] = [];

    for (const part of parts) {
        let event = "message";
        let id: string | undefined;
        const data: string[] = [];
        for (const line of part.split("\n")) {
            if (line === "" || line.startsWith(":")) continue; // blank / comment (heartbeat)
            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            let value = colon === -1 ? "" : line.slice(colon + 1);
            if (value.startsWith(" ")) value = value.slice(1);
            if (field === "event") event = value;
            else if (field === "data") data.push(value);
            else if (field === "id") id = value;
        }
        if (data.length > 0) events.push({ event, data: data.join("\n"), ...(id !== undefined ? { id } : {}) });
    }
    return { events, rest };
}

/** Reads a streamed body to the end, calling `onEvent` for every complete event. */
export async function readSseStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: RawSseEvent) => void,
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // stream: true keeps multi-byte characters (₹, Hindi) intact across chunks.
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = parseSseChunk(buffer);
            buffer = rest;
            for (const event of events) onEvent(event);
        }
    } finally {
        reader.releaseLock();
    }
}
