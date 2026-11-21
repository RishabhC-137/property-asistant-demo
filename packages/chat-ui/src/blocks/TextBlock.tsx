import { useEffect, useRef } from "react";
import { TypingDots } from "../components/TypingDots.js";
import { RichText } from "../lib/richText.js";
import { useTyping, useTypewriter } from "./typing.js";
import type { BlockProps } from "./types.js";

/** Assistant text with light formatting (never HTML). Live replies are typed out. */
export function TextBlock({ block }: BlockProps<"text">) {
    const { animate, onTyped } = useTyping();
    const text = block.data.text;
    const shown = useTypewriter(text, animate);
    const typing = shown.length < text.length;

    // A ref, so a new callback identity on re-render does not re-fire the effect.
    const onTypedRef = useRef(onTyped);
    onTypedRef.current = onTyped;
    useEffect(() => {
        if (!typing) onTypedRef.current();
    }, [typing, text]);

    // Until the first character is typed, keep the dots rather than an empty bubble.
    if (typing && shown.length === 0) return <TypingDots />;
    return <RichText text={shown} className={typing ? "rec-text rec-text--rich rec-text--typing" : "rec-text rec-text--rich"} />;
}
