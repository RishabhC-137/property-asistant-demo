/**
 * The chat assistant as a drop-in widget for another website:
 *
 *   <script src="https://<chat-api>/embed.js"></script>
 *   <script>CatalogChat.mount({ apiBaseUrl: "https://<chat-api>/api/v1" })</script>
 *
 * It renders in a shadow root, so the page's styles cannot change it and its
 * styles cannot leak out. The chat is created only when someone first opens it.
 * Calling mount again (e.g. on another page) updates the options and keeps the chat.
 */
import chatUiCss from "@property-assistant/chat-ui/styles.css?inline";
import { ChatWidget, type KnownUser, type PageContent, type ThemeInput, type WishlistAdapter } from "@property-assistant/chat-ui";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import embedCss from "./embed.css?inline";

export interface MountOptions {
    /** The chat API, e.g. "https://chat.example.com/api/v1". */
    apiBaseUrl: string;
    /** Theme tokens on top of the Property Desk look; values may be the page's CSS variables, e.g. "var(--brand)". */
    theme?: Exclude<ThemeInput, string>;
    /** The signed-in visitor: fills in the contact forms. */
    user?: KnownUser;
    /** Fetches a fresh short-lived identity ticket from the host website. */
    getAuthToken?: () => Promise<string | null>;
    /** The project the page is about (its id or URL slug). */
    projectId?: string;
    /** User-specific browser key for resuming a conversation. */
    storageKey?: string | null;
    title?: string;
    subtitle?: string;
    logoUrl?: string;
    welcomeMessage?: string;
    suggestions?: string[];
    /** Text on the launcher button (hidden on phones). */
    launcherLabel?: string;
    /** A short hello shown once per visit; null for none. */
    teaser?: string | null;
    position?: "right" | "left";
    /** The website's "send to yourself" endpoint; defaults to this page's /api/share/send. Null turns it off. */
    shareEndpoint?: string | null;
    /**
     * The website's wishlist, so hearts in the chat save to the visitor's account and match
     * the site's hearts: `{ has(id), toggle(project), subscribe(listener) }`. Without it,
     * the chat keeps saves in this browser only.
     */
    wishlist?: WishlistAdapter;
    /** The number the header's Call button dials; defaults to the Property Desk office. Null hides it. */
    phone?: string | null;
    /**
     * "Ask about this page" (on by default): the visitor can ask about the page they are on,
     * and selecting text on it offers to ask about that. The page's text is read in the
     * browser only when they choose to, and sent with their messages. False turns it off.
     */
    askAboutPage?: boolean;
    /** Where the page's main text is, e.g. "main" or "#content"; defaults to <main>, else the body. */
    pageContentSelector?: string;
}

/** Property Desk's office line, as on the website's contact page. */
export const PROPERTY_DESK_PHONE = "";

/** The Property Desk look: navy, cream and orange, in the site's Poppins. */
export const PROPERTY_DESK_THEME: Exclude<ThemeInput, string> = {
    base: "light",
    colorPrimary: "#0c194f",
    colorOnPrimary: "#ffffff",
    colorBackground: "#ffffff",
    colorSurface: "#ffffff",
    colorSurfaceMuted: "#f7f5ea",
    colorText: "#121212",
    colorTextMuted: "#5d6275",
    colorBorder: "#e7e4d6",
    colorUserBubble: "#0c194f",
    colorOnUserBubble: "#ffffff",
    colorAssistantBubble: "#f7f5ea",
    colorOnAssistantBubble: "#121212",
    colorFocus: "#ff9500",
    fontFamily: 'var(--font-poppins), "Poppins", system-ui, -apple-system, sans-serif',
    fontSize: "15px",
    radius: "16px",
    radiusSmall: "10px",
    shadow: "none",
};

const TEASER_KEY = "gs-chat-teaser-seen";
const SPOT_KEY = "gs-chat-launcher-spot";
/** Pointer travel (px) before a press becomes a drag instead of a tap. */
const DRAG_SLOP = 6;
const EDGE = 8;

/** Where the visitor dragged the launcher: distance from one side and from the bottom. */
interface Spot {
    side: "left" | "right";
    x: number;
    y: number;
}

const savedSpot = (): Spot | null => {
    try {
        const spot = JSON.parse(localStorage.getItem(SPOT_KEY) ?? "null") as Spot | null;
        return spot && (spot.side === "left" || spot.side === "right") && Number.isFinite(spot.x) && Number.isFinite(spot.y) ? spot : null;
    } catch {
        return null;
    }
};

const saveSpot = (spot: Spot) => {
    try {
        localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
    } catch {
        // Storage blocked: the launcher returns to its corner next page.
    }
};

function ChatIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth="2.6" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}

const seen = () => {
    try {
        return sessionStorage.getItem(TEASER_KEY) === "1";
    } catch {
        return true;
    }
};

/** "Properties for Sale | Latest Projects | Property Desk" → "Properties for Sale": the first part names the page. */
export function pageTitle(title: string): string {
    const first = title.split(/\s+[|–—]\s+/)[0]?.trim();
    return first || title.trim();
}

/** Longest selection quoted into the message box. */
const QUOTE_CHARS = 280;
/** Characters read from the page before the chat trims it to its limit. */
const READ_CHARS = 20000;

function readPage(selector: string | undefined): PageContent | null {
    let root: Element | null = null;
    try {
        root = selector ? document.querySelector(selector) : null;
    } catch {
        root = null; // An invalid selector: fall back.
    }
    root ??= document.querySelector("main") ?? document.body;
    const text = root instanceof HTMLElement ? root.innerText.slice(0, READ_CHARS) : (root?.textContent ?? "").slice(0, READ_CHARS);
    if (!text.trim()) return null;
    return { url: window.location.href, title: pageTitle(document.title), text };
}

/** The page's title, kept up to date as a single-page site changes it. */
function useDocumentTitle(enabled: boolean): string {
    const [title, setTitle] = useState(() => (typeof document === "undefined" ? "" : pageTitle(document.title)));
    useEffect(() => {
        if (!enabled) return;
        const update = () => setTitle(pageTitle(document.title));
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
    }, [enabled]);
    return title;
}

interface Selected {
    text: string;
    /** Where the button goes, in viewport pixels: centred on x, above (or below) the text. */
    x: number;
    top: number;
    below: boolean;
}

/** Text the visitor has selected on the page (not in a form field or the chat), with where it is. */
function usePageSelection(enabled: boolean): [Selected | null, () => void] {
    const [selected, setSelected] = useState<Selected | null>(null);
    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const measure = () => {
            const sel = document.getSelection();
            const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
            if (!sel || sel.isCollapsed || sel.rangeCount === 0 || text.length < 3) return setSelected(null);
            const range = sel.getRangeAt(0);
            const node = range.commonAncestorContainer;
            const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
            if (!el || el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], #gs-chat-widget")) return setSelected(null);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return setSelected(null);
            if (rect.bottom < 0 || rect.top > window.innerHeight) return setSelected(null);
            const below = rect.top < 52;
            setSelected({ text, x: rect.left + rect.width / 2, top: below ? rect.bottom + 8 : rect.top - 44, below });
        };
        // Wait for the selection to settle, so the button doesn't chase a dragging mouse.
        const later = () => {
            clearTimeout(timer);
            timer = setTimeout(measure, 160);
        };
        document.addEventListener("selectionchange", later);
        window.addEventListener("scroll", later, { passive: true, capture: true });
        window.addEventListener("resize", later);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("selectionchange", later);
            window.removeEventListener("scroll", later, { capture: true });
            window.removeEventListener("resize", later);
        };
    }, [enabled]);
    return [selected, () => setSelected(null)];
}

let pageListener: ((text?: string) => void) | null = null;
let queuedPage: { text?: string } | null = null;

/**
 * Opens the chat asking about the page the visitor is on, e.g. from an "Ask about this
 * page" button on the site. `text` goes in the message box for them to send or change.
 */
export function askAboutPage(text?: string): void {
    if (pageListener) pageListener(text);
    else queuedPage = { text };
}

type AskRequest = { key: number; project: { id: string; name: string }; text: string };
let askListener: ((request: AskRequest) => void) | null = null;
let queuedAsk: AskRequest | null = null;
let askCount = 0;

/**
 * Opens the chat about one project, e.g. from an "Ask about this project" button. The
 * project stays the chat's subject until the visitor changes it.
 */
export function askAbout(project: { id: string; name: string }, text?: string): void {
    if (!project?.id) return;
    const request = { key: ++askCount, project, text: text || `Tell me about ${project.name || "this project"}` };
    if (askListener) askListener(request);
    else queuedAsk = request;
}

function Launcher(options: MountOptions) {
    const [open, setOpen] = useState(false);
    const [request, setRequest] = useState<AskRequest | undefined>(undefined);
    const pageOn = options.askAboutPage !== false;
    const title = useDocumentTitle(pageOn);
    const [selected, clearSelected] = usePageSelection(pageOn);
    const [pageRequest, setPageRequest] = useState<{ key: number; text: string } | undefined>(undefined);
    const selectorRef = useRef(options.pageContentSelector);
    selectorRef.current = options.pageContentSelector;
    const read = useCallback(() => readPage(selectorRef.current), []);
    // Mounted on first open and kept, so closing and reopening keeps the conversation.
    const [started, setStarted] = useState(false);
    const [teaser, setTeaser] = useState(false);
    const [spot, setSpot] = useState<Spot | null>(savedSpot);
    const [dragging, setDragging] = useState(false);
    const [, setViewport] = useState(0);
    const drag = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => {
        askListener = (next) => {
            setRequest(next);
            setStarted(true);
            setOpen(true);
        };
        if (queuedAsk) {
            askListener(queuedAsk);
            queuedAsk = null;
        }
        return () => {
            askListener = null;
        };
    }, []);

    useEffect(() => {
        if (!pageOn) return;
        pageListener = (text) => {
            setPageRequest((prev) => ({ key: (prev?.key ?? 0) + 1, text: text ?? "" }));
            setStarted(true);
            setOpen(true);
        };
        if (queuedPage) {
            pageListener(queuedPage.text);
            queuedPage = null;
        }
        return () => {
            pageListener = null;
        };
    }, [pageOn]);

    const askSelected = () => {
        if (!selected) return;
        const quote = selected.text.length > QUOTE_CHARS ? `${selected.text.slice(0, QUOTE_CHARS - 1).trimEnd()}…` : selected.text;
        clearSelected();
        document.getSelection()?.removeAllRanges();
        hideTeaser();
        pageListener?.(`Explain this from the page: “${quote}”`);
    };

    // Re-clamp the dragged launcher when the window changes size.
    useEffect(() => {
        const onResize = () => setViewport((n) => n + 1);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
        if (options.teaser === null || seen()) return;
        const timer = setTimeout(() => setTeaser(true), 6000);
        return () => clearTimeout(timer);
    }, [options.teaser]);

    const hideTeaser = () => {
        setTeaser(false);
        try {
            sessionStorage.setItem(TEASER_KEY, "1");
        } catch {
            // Storage blocked: the hello may show again next page.
        }
    };
    const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        drag.current = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, startX: e.clientX, startY: e.clientY, moved: false };
    };
    const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        if (!d.moved) {
            if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_SLOP) return;
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            hideTeaser();
        }
        const { width, height } = e.currentTarget.getBoundingClientRect();
        const left = Math.min(Math.max(e.clientX - d.dx, EDGE), window.innerWidth - width - EDGE);
        const top = Math.min(Math.max(e.clientY - d.dy, EDGE), window.innerHeight - height - EDGE);
        const onLeft = left + width / 2 < window.innerWidth / 2;
        setSpot({
            side: onLeft ? "left" : "right",
            x: Math.round(onLeft ? left : window.innerWidth - left - width),
            y: Math.round(window.innerHeight - top - height),
        });
    };
    const onPointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        if (!d.moved) return;
        // The click that follows a drag should not open the chat.
        suppressClick.current = true;
        setDragging(false);
        setSpot((s) => {
            if (s) saveSpot(s);
            return s;
        });
    };

    const toggle = () => {
        if (suppressClick.current) {
            suppressClick.current = false;
            return;
        }
        hideTeaser();
        setStarted(true);
        setOpen((o) => !o);
    };

    const left = spot ? spot.side === "left" : options.position === "left";
    let rootStyle: CSSProperties | undefined;
    if (spot) {
        // Keep the launcher on screen, and leave room above it for the open panel.
        const panelRoom = open ? Math.min(680, window.innerHeight - 120) + 12 : 0;
        const maxY = Math.max(EDGE, window.innerHeight - 62 - panelRoom - EDGE);
        const maxX = Math.max(EDGE, window.innerWidth - 62 - EDGE);
        const x = Math.min(Math.max(spot.x, EDGE), maxX);
        const y = Math.min(Math.max(spot.y, EDGE), maxY);
        rootStyle = spot.side === "left" ? { left: x, right: "auto", bottom: y } : { right: x, left: "auto", bottom: y };
    }
    return (
        <>
        {selected && (
            <button
                type="button"
                className={`gs-ask-selection${selected.below ? " gs-ask-selection--below" : ""}`}
                style={{ left: Math.min(Math.max(selected.x, 90), window.innerWidth - 90), top: selected.top }}
                // Keep the selection while pressing.
                onPointerDown={(e) => e.preventDefault()}
                onClick={askSelected}
            >
                <span className="gs-ask-selection__icon" aria-hidden="true">
                    <ChatIcon />
                </span>
                Ask Property Desk about this
            </button>
        )}
        <div
            className={`gs-root${left ? " gs-root--left" : ""}${open ? " gs-root--chat-open" : ""}${dragging ? " gs-root--dragging" : ""}`}
            style={rootStyle}
        >
            {started && (
                <div className="gs-panel" hidden={!open} role="dialog" data-lenis-prevent="" aria-label={options.title ?? "Property assistant"}>
                    <ChatWidget
                        apiBaseUrl={options.apiBaseUrl}
                        theme={{ ...PROPERTY_DESK_THEME, ...options.theme }}
                        title={options.title ?? "Property Desk"}
                        subtitle={options.subtitle ?? "Property assistant · replies instantly"}
                        logoUrl={options.logoUrl ?? `${window.location.origin}/catalog-logo.png`}
                        welcomeMessage={
                            options.welcomeMessage ??
                            "Hi! I can help you find homes in Gurugram, compare projects, check payment plans and request a site visit."
                        }
                        suggestions={options.suggestions ?? ["3 BHK under ₹3 Cr", "New launches on Dwarka Expressway", "Request a site visit"]}
                        user={options.user}
                        getAuthToken={options.getAuthToken}
                        projectId={options.projectId}
                        request={request}
                        shareEndpoint={options.shareEndpoint === null ? undefined : (options.shareEndpoint ?? `${window.location.origin}/api/share/send`)}
                        wishlist={options.wishlist}
                        phone={options.phone === null ? undefined : (options.phone ?? PROPERTY_DESK_PHONE)}
                        pageTitle={pageOn ? title : undefined}
                        readPage={pageOn ? read : undefined}
                        pageRequest={pageRequest}
                        storageKey={options.storageKey ?? (options.user?.phone ? `gs-chat:${options.user.phone}` : "gs-chat:conversationId")}
                        onClose={() => setOpen(false)}
                    />
                </div>
            )}
            {teaser && !open && (
                <div className="gs-teaser" role="status" onClick={toggle}>
                    {options.teaser ?? (
                        <>
                            <strong>Looking for a home in Gurugram?</strong> Ask me about prices, projects or a site visit.
                        </>
                    )}
                    <button
                        type="button"
                        className="gs-teaser__close"
                        aria-label="Dismiss"
                        onClick={(e) => {
                            e.stopPropagation();
                            hideTeaser();
                        }}
                    >
                        ×
                    </button>
                </div>
            )}
            <button
                type="button"
                className={`gs-launcher${open ? " gs-launcher--open" : ""}`}
                onClick={toggle}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                title="Drag to move"
                aria-expanded={open}
                aria-label={open ? "Close chat" : (options.launcherLabel ?? "Chat with our property assistant")}
            >
                {open ? (
                    <CloseIcon />
                ) : (
                    <>
                        <span className="gs-launcher__icon">
                            <ChatIcon />
                        </span>
                        <span className="gs-launcher__dot" aria-hidden="true" />
                        <span className="gs-launcher__label" aria-hidden="true">{options.launcherLabel ?? "Ask Property Desk AI"}</span>
                    </>
                )}
            </button>
        </div>
        </>
    );
}

let mounted: { host: HTMLElement; root: Root } | null = null;

/** Adds the widget to the page; when it is already there, updates its options. */
export function mount(options: MountOptions): void {
    if (typeof document === "undefined") return;
    if (mounted) {
        mounted.root.render(<Launcher {...options} />);
        return;
    }
    const host = document.createElement("div");
    host.id = "gs-chat-widget";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${chatUiCss}\n${embedCss}`;
    const container = document.createElement("div");
    shadow.append(style, container);
    document.body.appendChild(host);
    const root = createRoot(container);
    root.render(<Launcher {...options} />);
    mounted = { host, root };
}

/** Removes the widget (e.g. on pages where it should not show). */
export function unmount(): void {
    if (!mounted) return;
    mounted.root.unmount();
    mounted.host.remove();
    mounted = null;
}
