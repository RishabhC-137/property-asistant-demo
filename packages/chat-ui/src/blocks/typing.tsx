import { createContext, useContext, useEffect, useRef, useState } from "react";

/** Steady typing speed. */
const CHARS_PER_SECOND = 70;
/** Never fall further behind the received text than this; big chunks are typed faster. */
const MAX_LAG_MS = 700;

export interface TypingOptions {
    /** Type the text out instead of showing it at once (live replies only). */
    animate: boolean;
    /** Called once the text is fully shown, so the next block can appear. */
    onTyped: () => void;
}

/** Off by default: text in history, replays and custom hosts renders immediately. */
export const TypingContext = createContext<TypingOptions>({ animate: false, onTyped: () => {} });

export const useTyping = () => useContext(TypingContext);

export function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Reveals `text` a few characters per frame, ChatGPT-style. As more text
 * streams in, it keeps typing from where it was; when a large chunk lands it
 * speeds up so the visible text is never more than MAX_LAG_MS behind.
 */
export function useTypewriter(text: string, animate: boolean): string {
    const canAnimate = animate && typeof requestAnimationFrame !== "undefined";
    const [count, setCount] = useState(canAnimate ? 0 : text.length);
    const shown = useRef(count);

    useEffect(() => {
        if (!canAnimate) {
            shown.current = text.length;
            setCount(text.length);
            return;
        }
        if (shown.current >= text.length) return;

        let frame = 0;
        let last = performance.now();
        let pending = 0;
        const tick = (now: number) => {
            const elapsed = now - last;
            last = now;
            const remaining = text.length - shown.current;
            pending += Math.max((CHARS_PER_SECOND * elapsed) / 1000, (remaining * elapsed) / MAX_LAG_MS);
            const step = Math.floor(pending);
            if (step > 0) {
                pending -= step;
                shown.current = Math.min(text.length, shown.current + step);
                setCount(shown.current);
            }
            if (shown.current < text.length) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [text, canAnimate]);

    return text.slice(0, count);
}
