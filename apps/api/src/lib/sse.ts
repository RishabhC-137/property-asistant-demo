import type { ServerResponse } from "node:http";
import type { SseEvent } from "@property-assistant/contracts";

export type EmitEvent = (event: SseEvent) => void;

/**
 * Minimal Server-Sent Events writer over a raw Node response. Writes after the
 * client disconnects are dropped silently — generation keeps going so the
 * result is persisted and can be replayed on retry.
 */
export class SseStream {
    constructor(private readonly raw: ServerResponse) {}

    get isOpen(): boolean {
        return !this.raw.destroyed && !this.raw.writableEnded;
    }

    open(extraHeaders: Record<string, string> = {}): void {
        this.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            ...extraHeaders,
        });
        this.raw.flushHeaders();
    }

    readonly send: EmitEvent = (event) => {
        if (!this.isOpen) return;
        // JSON.stringify never emits raw newlines, so one `data:` line is safe.
        this.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };

    end(): void {
        if (this.isOpen) this.raw.end();
    }
}
