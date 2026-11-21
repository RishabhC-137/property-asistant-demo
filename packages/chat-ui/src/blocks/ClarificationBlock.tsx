import { Icon } from "../icons/Icon.js";
import type { BlockProps } from "./types.js";

export function ClarificationBlock({ block }: BlockProps<"clarification">) {
    return (
        <section className="rec-block rec-clarification">
            <ul>
                {block.data.questions.map((q) => (
                    <li key={q.id}>
                        <Icon name="info" size={16} />
                        <span>{q.text}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
