import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSseChunk, readSseStream, type RawSseEvent } from "./sse.js";

function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const c of chunks) controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
            controller.close();
        },
    });
}

describe("parseSseChunk", () => {
    it("parses named events, default names, ids, multi-line data and comments", () => {
        const { events, rest } = parseSseChunk(
            'event: text.delta\nid: 7\ndata: {"a":1}\n\n: ping\n\ndata: line1\ndata: line2\n\nevent:x\ndata:{}\n\n',
        );
        assert.deepEqual(events, [
            { event: "text.delta", data: '{"a":1}', id: "7" },
            { event: "message", data: "line1\nline2" },
            { event: "x", data: "{}" },
        ]);
        assert.equal(rest, "");
    });

    it("keeps an incomplete trailing event as rest", () => {
        const { events, rest } = parseSseChunk('event: block\ndata: {"a"');
        assert.deepEqual(events, []);
        assert.equal(rest, 'event: block\ndata: {"a"');
    });

    it("accepts CRLF line endings and ignores data-less events", () => {
        const { events } = parseSseChunk("event: a\r\ndata: 1\r\n\r\nevent: empty\r\n\r\n");
        assert.deepEqual(events, [{ event: "a", data: "1" }]);
    });
});

describe("readSseStream", () => {
    it("reassembles events split across chunks, including multi-byte characters", async () => {
        const bytes = new TextEncoder().encode('event: text.delta\ndata: {"delta":"₹3.5 Cr"}\n\n');
        const rupee = bytes.indexOf(0xe2); // first byte of "₹"
        const chunks = [bytes.slice(0, rupee + 1), bytes.slice(rupee + 1, rupee + 2), bytes.slice(rupee + 2)];
        const events: RawSseEvent[] = [];
        await readSseStream(streamOf([...chunks, "event: done\ndata: {}\n\n"]), (e) => events.push(e));
        assert.deepEqual(events, [
            { event: "text.delta", data: '{"delta":"₹3.5 Cr"}' },
            { event: "done", data: "{}" },
        ]);
    });
});
