import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMemory } from "../src/modules/chat/conversation-memory.js";
import type { EarlierMessage } from "../src/modules/chat/message.repository.js";

const user = (content: string): EarlierMessage => ({ role: "user", content, blocks: [] });
const reply = (...blocks: EarlierMessage["blocks"]): EarlierMessage => ({ role: "assistant", content: "ok", blocks });
const cards = (title: string, ...projects: Array<[string, string]>) => ({
    type: "property_cards" as const,
    title,
    projects: projects.map(([id, name]) => ({ id, name })),
});

describe("conversation memory", () => {
    it("is null when nothing is older than the history window", () => {
        assert.equal(buildMemory([]), null);
    });

    it("keeps requests, searches, projects (latest first, with how they were seen) and forms", () => {
        const memory = buildMemory([
            user("Show me 3 BHK flats under 4 crore"),
            reply(cards("Projects: 3 BHK, under ₹4 Cr", ["a", "Godrej Zenith"], ["b", "M3M Woodshire"])),
            user("one with   swimming pool"),
            reply(cards("Projects: 3 BHK, under ₹4 Cr", ["b", "M3M Woodshire"])),
            user("pics of woodshire"),
            reply({ type: "property_gallery", title: null, projects: [{ id: "b", name: "M3M Woodshire" }] }),
            user("compare with Antalya"),
            reply({ type: "property_comparison", title: "Compare", projects: [{ id: "b", name: "M3M Woodshire" }, { id: "c", name: "M3M Antalya Hills" }] }),
            user("call me"),
            reply({ type: "lead_capture_form", title: "Request a callback", projects: [] }),
            reply(cards("Matching projects", ["d", "DLF Privana"])),
        ]);
        assert.deepEqual(memory, {
            messageCount: 11,
            userRequests: [
                "Show me 3 BHK flats under 4 crore",
                "one with swimming pool",
                "pics of woodshire",
                "compare with Antalya",
                "call me",
            ],
            searches: ["3 BHK, under ₹4 Cr"],
            projects: [
                { id: "d", name: "DLF Privana", seen: ["card"] },
                { id: "c", name: "M3M Antalya Hills", seen: ["comparison"] },
                { id: "b", name: "M3M Woodshire", seen: ["card", "photos", "comparison"] },
                { id: "a", name: "Godrej Zenith", seen: ["card"] },
            ],
            forms: ["callback"],
        });
    });

    it("stays small however long the conversation is", () => {
        const messages = Array.from({ length: 60 }, (_, i) =>
            i % 2 === 0 ? user(`request ${i} ${"x".repeat(300)}`) : reply(cards(`Projects: search ${i}`, [`id${i}`, `Project ${i}`])),
        );
        const memory = buildMemory(messages)!;
        assert.equal(memory.userRequests.length, 10);
        assert.ok(memory.userRequests.every((r) => r.length <= 150));
        assert.deepEqual(memory.searches, ["search 51", "search 53", "search 55", "search 57", "search 59"]);
        assert.equal(memory.projects.length, 12);
        assert.equal(memory.projects[0]?.name, "Project 59");
    });
});
