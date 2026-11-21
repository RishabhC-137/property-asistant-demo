import { useEffect, type RefObject } from "react";

/** Whether `el` is a scroll area with room left to move by (dx, dy). */
function canScroll(el: Element, dx: number, dy: number): boolean {
    const style = getComputedStyle(el);
    const scrollable = (overflow: string) => overflow === "auto" || overflow === "scroll";
    if (dy && scrollable(style.overflowY) && el.scrollHeight > el.clientHeight) {
        if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
    if (dx && scrollable(style.overflowX) && el.scrollWidth > el.clientWidth) {
        const left = Math.abs(el.scrollLeft);
        if (dx < 0 ? left > 0 : left + el.clientWidth < el.scrollWidth - 1) return true;
    }
    return false;
}

/** Whether an element between the event target and `root` can still scroll by (dx, dy). */
function insideCanScroll(event: Event, root: HTMLElement, dx: number, dy: number): boolean {
    for (const node of event.composedPath()) {
        if (node === root) break;
        if (node instanceof Element && canScroll(node, dx, dy)) return true;
    }
    return false;
}

/**
 * While the pointer (or a finger) is over the chat, scrolling moves only the chat:
 * a scroll area inside it moves if it can, and otherwise the page behind stays put
 * (no scrolling the website from the header, or once the messages hit the top or bottom).
 */
export function useContainWheel(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        // Every handler stops propagation so page-level smooth scrollers (Lenis and the like,
        // listening on window) never see the gesture: they cancel the native scroll and move
        // the page instead.
        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey) return; // pinch-zoom
            event.stopPropagation();
            // Shift + wheel scrolls sideways on mice that only report vertical movement.
            const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
            const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
            if (!insideCanScroll(event, root, dx, dy)) event.preventDefault();
        };
        let last: { x: number; y: number } | null = null;
        const onTouchStart = (event: TouchEvent) => {
            event.stopPropagation();
            const touch = event.touches[0];
            last = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
        };
        const onTouchMove = (event: TouchEvent) => {
            event.stopPropagation();
            const touch = event.touches[0];
            if (!last || event.touches.length !== 1 || !touch) return; // pinch-zoom
            // A finger moving up scrolls the content down, like a positive wheel delta.
            const dx = last.x - touch.clientX;
            const dy = last.y - touch.clientY;
            last = { x: touch.clientX, y: touch.clientY };
            if (event.cancelable && !insideCanScroll(event, root, dx, dy)) event.preventDefault();
        };
        const onTouchEnd = (event: TouchEvent) => {
            event.stopPropagation();
            last = null;
        };
        // Not passive, so preventDefault can stop the page from scrolling.
        root.addEventListener("wheel", onWheel, { passive: false });
        root.addEventListener("touchstart", onTouchStart, { passive: true });
        root.addEventListener("touchmove", onTouchMove, { passive: false });
        root.addEventListener("touchend", onTouchEnd, { passive: true });
        return () => {
            root.removeEventListener("wheel", onWheel);
            root.removeEventListener("touchstart", onTouchStart);
            root.removeEventListener("touchmove", onTouchMove);
            root.removeEventListener("touchend", onTouchEnd);
        };
    }, [ref]);
}
