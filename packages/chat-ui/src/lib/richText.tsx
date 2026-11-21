import { Fragment, type ReactNode } from "react";

export type RichTextBlock = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const BULLET = /^\s*[-•*]\s+/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+/;

/**
 * Splits assistant text into paragraphs and lists: "- " / "• " lines become a
 * bullet list, "1. " lines a numbered list, blank lines separate paragraphs.
 * The result is plain strings; nothing is ever interpreted as HTML.
 */
export function parseRichText(text: string): RichTextBlock[] {
    const blocks: RichTextBlock[] = [];
    let paragraph: string[] = [];
    const endParagraph = () => {
        if (paragraph.length > 0) blocks.push({ kind: "p", lines: paragraph });
        paragraph = [];
    };

    for (const raw of text.split("\n")) {
        const line = raw.trimEnd();
        const kind = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null;
        if (kind) {
            endParagraph();
            const item = line.replace(kind === "ul" ? BULLET : NUMBERED, "");
            const last = blocks.at(-1);
            if (last && last.kind === kind) last.items.push(item);
            else blocks.push({ kind, items: [item] });
        } else if (line.trim() === "") {
            endParagraph();
        } else {
            paragraph.push(line);
        }
    }
    endParagraph();
    return blocks;
}

/**
 * "**bold**" becomes <strong> and "*italic*" <em>. Markers not yet closed
 * (mid-typing) are hidden rather than shown as asterisks.
 */
function inline(text: string): ReactNode[] {
    return text.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g).map((part, i) => {
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part.replaceAll("*", "")}</Fragment>;
    });
}

/** Assistant text with light formatting: paragraphs, line breaks, lists and bold. */
export function RichText({ text, className }: { text: string; className: string }) {
    return (
        <div className={className}>
            {parseRichText(text).map((block, i) => {
                if (block.kind === "p") {
                    return (
                        <p key={i}>
                            {block.lines.map((line, j) => (
                                <Fragment key={j}>
                                    {j > 0 && <br />}
                                    {inline(line)}
                                </Fragment>
                            ))}
                        </p>
                    );
                }
                const List = block.kind;
                return (
                    <List key={i}>
                        {block.items.map((item, j) => (
                            <li key={j}>{inline(item)}</li>
                        ))}
                    </List>
                );
            })}
        </div>
    );
}
