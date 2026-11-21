import type { NameSuggestion } from "@property-assistant/llm";

/** Words that say what is wanted rather than which project, e.g. "show me the details of". */
const FILLER = new Set([
    "a", "about", "and", "at", "by", "details", "detail", "for", "metro", "metro city", "in", "info", "me",
    "of", "project", "projects", "property", "show", "tell", "the",
]);

/** How close a name must be (0–1) to be offered. */
const MIN_SCORE = 0.7;
/** Names well behind the closest one are left out, so a clear match stands alone. */
const MAX_BEHIND_BEST = 0.15;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (value: string) => normalize(value).split(" ").filter((w) => w.length > 0 && !FILLER.has(w));

function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length]!;
}

const similarity = (a: string, b: string) => 1 - editDistance(a, b) / Math.max(a.length, b.length);

/**
 * 1 for the same word, less for each typo. A typed start of a longer word
 * ("godr") or a longer spelling of a word ("marquee" for "marq") counts as close.
 */
function wordSimilarity(typed: string, word: string): number {
    if (typed === word) return 1;
    if (typed.length >= 3 && word.startsWith(typed)) return 0.9;
    if (word.length >= 4 && typed.startsWith(word)) return 0.8;
    return similarity(typed, word);
}

/**
 * How well `typed` names `name`: each typed word against its closest word in
 * the name, or what was typed without spaces against a run of the name's words
 * ("skyark" for "Sky Arc", "godrejzenith"), whichever is better.
 */
export function nameScore(typed: string, name: string): number {
    const typedWords = words(typed);
    const nameWords = words(name);
    if (typedWords.length === 0 || nameWords.length === 0) return 0;
    // Numbers are never typos: "Sector 49" is not "Sector 86".
    const numbers = typedWords.join(" ").match(/\d+/g) ?? [];
    if (!numbers.every((n) => nameWords.some((w) => w.match(/\d+/g)?.includes(n)))) return 0;
    const perWord = typedWords.reduce((sum, t) => sum + Math.max(...nameWords.map((w) => wordSimilarity(t, w))), 0) / typedWords.length;
    const joined = typedWords.join("");
    let run = 0;
    for (let start = 0; start < nameWords.length; start++) {
        for (let end = start + 1; end <= nameWords.length; end++) {
            run = Math.max(run, similarity(joined, nameWords.slice(start, end).join("")));
        }
    }
    return Math.max(perWord, run);
}

/** Projects and developers whose names are close to `typed`, closest first. */
export function suggestNames(
    typed: string,
    projects: ReadonlyArray<{ id: string; name: string; developer: string | null }>,
    limit: number,
): NameSuggestion[] {
    const scored: Array<NameSuggestion & { score: number }> = [];
    const developers = new Set<string>();
    for (const project of projects) {
        scored.push({ kind: "project", id: project.id, name: project.name, score: nameScore(typed, project.name) });
        if (project.developer) developers.add(project.developer);
    }
    for (const developer of developers) {
        scored.push({ kind: "developer", id: null, name: developer, score: nameScore(typed, developer) });
    }
    const seen = new Set<string>();
    const close = scored.filter((s) => s.score >= MIN_SCORE).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const best = close[0]?.score ?? 0;
    return close
        .filter((s) => s.score >= best - MAX_BEHIND_BEST)
        .filter((s) => !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()))
        .slice(0, limit)
        .map(({ kind, id, name }) => ({ kind, id, name }));
}
