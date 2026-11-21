import type { ConversationMemory } from "@property-assistant/llm";
import type { EarlierMessage } from "./message.repository.js";

const MAX_REQUESTS = 10;
const REQUEST_LENGTH = 150;
const MAX_SEARCHES = 5;
const MAX_PROJECTS = 12;

const SEEN_BY_BLOCK = {
    property_cards: "card",
    property_comparison: "comparison",
    property_gallery: "photos",
} as const;

const shorten = (text: string, max: number) => {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/**
 * Condenses the messages before the history window into a memory the model
 * can use: what the user asked, what was searched, which projects they saw
 * and how, and which forms were offered. Built from stored data only, so it
 * costs no model call and cannot invent anything.
 */
export function buildMemory(messages: readonly EarlierMessage[]): ConversationMemory | null {
    if (messages.length === 0) return null;

    const requests = messages.filter((m) => m.role === "user").map((m) => shorten(m.content, REQUEST_LENGTH));
    const searches: string[] = [];
    const projects = new Map<string, { id: string; name: string; seen: Set<"card" | "comparison" | "photos"> }>();
    const forms = new Set<"callback" | "site_visit">();

    for (const message of messages) {
        for (const block of message.blocks) {
            if (block.type === "lead_capture_form") forms.add("callback");
            if (block.type === "site_visit_form") forms.add("site_visit");
            if (block.type === "property_cards" && block.title?.startsWith("Projects: ")) {
                const search = block.title.slice("Projects: ".length);
                if (searches.at(-1) !== search) searches.push(search);
            }
            const seen = SEEN_BY_BLOCK[block.type as keyof typeof SEEN_BY_BLOCK];
            if (!seen) continue;
            for (const { id, name } of block.projects) {
                if (!id || !name) continue;
                const entry = projects.get(id) ?? { id, name, seen: new Set() };
                entry.seen.add(seen);
                // Re-inserting moves the project to the end: the map ends with the most recent.
                projects.delete(id);
                projects.set(id, entry);
            }
        }
    }

    return {
        messageCount: messages.length,
        userRequests: requests.slice(-MAX_REQUESTS),
        searches: [...new Set(searches.reverse())].slice(0, MAX_SEARCHES).reverse(),
        projects: [...projects.values()]
            .reverse()
            .slice(0, MAX_PROJECTS)
            .map((p) => ({ id: p.id, name: p.name, seen: [...p.seen] })),
        forms: [...forms],
    };
}
