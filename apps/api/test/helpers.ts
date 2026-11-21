import assert from "node:assert/strict";
import type { SseEvent } from "@property-assistant/contracts";
import { buildApp, type BuildAppOptions } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import type { ChatProvider, ProviderEvent, ProviderInput } from "@property-assistant/llm";

export { pool };

/** Wipes chat tables — only ever in a database whose name ends with `_test`. */
export async function resetDatabase(): Promise<void> {
    const { rows } = await pool.query<{ db: string }>("SELECT current_database() AS db");
    assert.ok(rows[0]?.db.endsWith("_test"), `refusing to truncate non-test database ${rows[0]?.db}`);
    await pool.query("TRUNCATE message_blocks, messages, conversations");
}

export function testApp(options: BuildAppOptions = {}) {
    return buildApp({ logger: false, ...options });
}

export type TestApp = ReturnType<typeof testApp>;

export function parseSse(payload: string): SseEvent[] {
    return payload
        .split("\n\n")
        .filter((chunk) => chunk.trim() !== "")
        .map((chunk) => {
            const lines = chunk.split("\n");
            const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
            const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
            assert.ok(event && data, `malformed SSE chunk: ${chunk}`);
            return { event, data: JSON.parse(data) } as SseEvent;
        });
}

export async function createConversation(app: TestApp): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/api/v1/conversations" });
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data.id;
}

export function sendMessage(app: TestApp, conversationId: string, payload: unknown) {
    return app.inject({
        method: "POST",
        url: `/api/v1/conversations/${conversationId}/messages`,
        payload: payload as Record<string, unknown>,
    });
}

/** Wraps a provider and counts how many generations it started. */
export class CountingProvider implements ChatProvider {
    readonly name = "counting";
    calls = 0;
    constructor(private readonly inner: ChatProvider) {}
    async *generate(input: ProviderInput): AsyncIterable<ProviderEvent> {
        this.calls += 1;
        yield* this.inner.generate(input);
    }
}

/** Provider that blocks mid-stream until `release()` — for in-flight duplicates. */
export class GatedProvider implements ChatProvider {
    readonly name = "gated";
    calls = 0;
    private open!: () => void;
    private readonly gate = new Promise<void>((resolve) => (this.open = resolve));
    private startedResolve!: () => void;
    readonly started = new Promise<void>((resolve) => (this.startedResolve = resolve));

    release() {
        this.open();
    }

    async *generate(): AsyncIterable<ProviderEvent> {
        this.calls += 1;
        yield { kind: "text", delta: "Working " };
        this.startedResolve();
        await this.gate;
        yield { kind: "text", delta: "done." };
    }
}

/** Provider built from a fixed script, optionally throwing after it. */
export class ScriptedProvider implements ChatProvider {
    readonly name = "scripted";
    calls = 0;
    constructor(
        private readonly events: ProviderEvent[],
        private readonly failAfter: Error | null = null,
    ) {}
    async *generate(): AsyncIterable<ProviderEvent> {
        this.calls += 1;
        for (const event of this.events) yield event;
        if (this.failAfter) throw this.failAfter;
    }
}
