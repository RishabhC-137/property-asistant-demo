import type { BlockProps } from "./types.js";

export function QuickRepliesBlock({ block, actions }: BlockProps<"quick_replies">) {
    return (
        <section className="rec-block">
            {block.data.prompt && <p className="rec-muted rec-small">{block.data.prompt}</p>}
            <div className="rec-chips" role="group" aria-label={block.data.prompt ?? "Suggested replies"}>
                {block.data.options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        className="rec-chip"
                        disabled={actions.busy}
                        onClick={() => actions.sendMessage(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </section>
    );
}
