import {
    MAX_PAGE_TEXT_LENGTH,
    MAX_PAGE_TITLE_LENGTH,
    MAX_PAGE_URL_LENGTH,
    type LeadCaptureFormBlock,
    type MessageContext,
    type SiteVisitFormBlock,
} from "@property-assistant/contracts";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createChatApi, type ChatApi } from "../api/client.js";
import { defaultBlockRenderers } from "../blocks/registry.js";
import type { BlockActions, BlockRenderers } from "../blocks/types.js";
import { IconProvider } from "../icons/Icon.js";
import { ShareContext } from "../blocks/ShareSheet.js";
import { resolveIcons } from "../icons/resolveIcons.js";
import type { IconsInput } from "../icons/types.js";
import { useContainWheel } from "../lib/containWheel.js";
import { WishlistContext, type WishlistAdapter } from "../lib/wishlist.js";
import { useChat, type ChatDebugEvent } from "../state/useChat.js";
import { resolveTheme, themeToCssVars, type ThemeDefinition, type ThemeInput } from "../theme/theme.js";
import { usePrefersDark } from "../theme/usePrefersDark.js";
import { AskPanel, isAskBlock, type AskBlock, type KnownUser, type LeadActions } from "./AskPanel.js";
import { ChatHeader } from "./ChatHeader.js";
import { Composer } from "./Composer.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { MessageList } from "./MessageList.js";
import { Notice } from "./Notice.js";

/** A stable key per block, so the panel starts fresh for each new question or form. */
const askKeys = new WeakMap<AskBlock, number>();
let nextAskKey = 0;
const askKey = (block: AskBlock) => {
    if (!askKeys.has(block)) askKeys.set(block, ++nextAskKey);
    return askKeys.get(block)!;
};

export interface ChatWidgetProps {
    /** Base URL of the chatbot API, e.g. "https://api.example.com/api/v1". Default "/api/v1". */
    apiBaseUrl?: string;
    /** Or a custom client (tests, a different transport). Takes precedence over `apiBaseUrl`. */
    api?: ChatApi;
    /** Fetches a short-lived identity ticket from the host website for each API request. */
    getAuthToken?: () => Promise<string | null>;

    /** "light" | "dark" | "auto" | a name from `themes` | token overrides `{ base, colorPrimary, … }`. */
    theme?: ThemeInput;
    /** Your own named themes, selectable via `theme="<name>"`. */
    themes?: Record<string, ThemeDefinition>;
    /** Icons: `{ library, names }` for any icon library, or components directly `{ send: MyIcon }`. */
    icons?: IconsInput;
    /** Replace how specific block types render. Unlisted types use the defaults. */
    blockRenderers?: Partial<BlockRenderers>;

    title?: string;
    subtitle?: string;
    /** Brand mark shown in the header when supplied by an embed host. */
    logoUrl?: string;
    placeholder?: string;
    welcomeMessage?: string;
    /** Starter prompts shown in an empty conversation. */
    suggestions?: string[];

    /** The signed-in visitor, if the site knows them: fills in the contact forms. Sent only when a form is. */
    user?: KnownUser;
    /** The project the page is about (its id or URL slug): questions that name no project are about it. */
    projectId?: string;
    /**
     * A question about one project from the host page ("Ask about this project"). Each new
     * `key` pins `project` as the chat's project (until the visitor changes it) and sends `text`.
     */
    request?: { key: number; project: { id: string; name: string }; text: string };
    /**
     * The host website's endpoint that sends a project's details to the visitor themself
     * (POST, with the site's cookies). Without it, Share offers only "Send to others".
     */
    shareEndpoint?: string;
    /**
     * The host website's wishlist, so hearts in the chat save to the visitor's account and
     * match the site's hearts. Without it, saves are kept in this browser only.
     */
    wishlist?: WishlistAdapter;
    /** A phone number for the Call button in the chat history panel; none hides the button. */
    phone?: string;
    /**
     * "Ask about this page": the host page's title, and a reader for what the page says
     * (called when a message is sent). Without them the option is hidden.
     */
    pageTitle?: string;
    readPage?: () => PageContent | null;
    /**
     * From the host page, e.g. text the visitor selected: each new `key` attaches the page
     * and puts `text` in the message box for the visitor to finish.
     */
    pageRequest?: { key: number; text: string };

    /** localStorage key for resuming the conversation; `null` disables persistence. */
    storageKey?: string | null;
    /** Called for every request and streamed event — useful for debugging panels and analytics. */
    onEvent?: (event: ChatDebugEvent) => void;
    /** Shows a close button in the header (for popup/launcher embeds). */
    onClose?: () => void;

    className?: string;
    style?: CSSProperties;
}

export interface PageContent {
    url: string;
    title: string;
    text: string;
}

/** Fits the page into the message limits; null when there is nothing to send. */
function fitPage(page: PageContent | null | undefined): MessageContext["pageContent"] | null {
    if (!page) return null;
    let url = page.url;
    if (url.length > MAX_PAGE_URL_LENGTH) {
        try {
            const u = new URL(url);
            url = `${u.origin}${u.pathname}`.slice(0, MAX_PAGE_URL_LENGTH);
        } catch {
            return null;
        }
    }
    const text = page.text.replace(/[^\S\n]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_PAGE_TEXT_LENGTH);
    if (!text || !/^https?:\/\//.test(url)) return null;
    return { url, title: page.title.trim().slice(0, MAX_PAGE_TITLE_LENGTH), text };
}

export function ChatWidget({
    apiBaseUrl = "/api/v1",
    api: customApi,
    getAuthToken,
    theme = "auto",
    themes,
    icons,
    blockRenderers,
    title = "Property assistant",
    subtitle = "Ask about homes in Gurugram",
    logoUrl,
    placeholder = "Ask about projects, budgets, BHK…",
    welcomeMessage = "Hi! I can help you explore projects, compare options and request a callback.",
    suggestions = ["Show me 3 BHK flats under 4 crore", "Compare projects", "Request a callback"],
    user,
    projectId,
    request,
    shareEndpoint,
    wishlist,
    phone,
    pageTitle,
    readPage,
    pageRequest,
    storageKey = "rec-chat:conversationId",
    onEvent,
    onClose,
    className,
    style,
}: ChatWidgetProps) {
    const api = useMemo(() => customApi ?? createChatApi(apiBaseUrl, undefined, { getAuthToken }), [customApi, apiBaseUrl, getAuthToken]);
    const [projectContext, setProjectContext] = useState<Array<{ id: string; name: string }>>([]);
    const context = useMemo(() => (projectId || projectContext.length ? { ...(projectId ? { projectId } : {}), ...(projectContext.length ? { projectIds: projectContext.map(({ id }) => id) } : {}) } : undefined), [projectId, projectContext]);
    const [pageAttached, setPageAttached] = useState(false);
    const readPageRef = useRef(readPage);
    readPageRef.current = readPage;
    // Read when a message is sent, so it is the page as it is then.
    const readContext = useCallback((): MessageContext | undefined => {
        const pageContent = pageAttached ? fitPage(readPageRef.current?.()) : null;
        return pageContent ? { ...context, pageContent } : context;
    }, [context, pageAttached]);
    const chat = useChat({ api, storageKey, onEvent, context: readContext });

    const [draft, setDraft] = useState<{ key: number; text: string } | undefined>(undefined);
    useEffect(() => {
        if (!pageRequest) return;
        setPageAttached(true);
        if (pageRequest.text) setDraft({ key: pageRequest.key, text: pageRequest.text });
    }, [pageRequest?.key]); // eslint-disable-line react-hooks/exhaustive-deps

    // A host-page question: pin its project first, then send once that context has rendered
    // (useChat reads the context from the latest render) and the chat is free.
    const pendingRequest = useRef<NonNullable<typeof request> | null>(null);
    useEffect(() => {
        if (!request) return;
        pendingRequest.current = request;
        setProjectContext([request.project]);
    }, [request?.key]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const next = pendingRequest.current;
        if (!next || chat.busy || !projectContext.some(({ id }) => id === next.project.id)) return;
        if (chat.send(next.text)) pendingRequest.current = null;
    }, [projectContext, chat.busy, chat.send, chat.state.phase]);

    const prefersDark = usePrefersDark();
    const resolvedTheme = useMemo(() => resolveTheme(theme, prefersDark, themes), [theme, prefersDark, themes]);
    const resolvedIcons = useMemo(() => resolveIcons(icons), [icons]);
    const renderers = useMemo<BlockRenderers>(
        () => ({ ...defaultBlockRenderers, ...blockRenderers }) as BlockRenderers,
        [blockRenderers],
    );

    // The step-by-step panel: opens by itself for questions or a form in the latest reply, or
    // when a form in the chat is reopened. Closed and sent ones are remembered for this tab.
    const [opened, setOpened] = useState<AskBlock | null>(null);
    const [closed, setClosed] = useState<ReadonlySet<AskBlock>>(new Set());
    const [sent, setSent] = useState<ReadonlySet<AskBlock>>(new Set());
    const [cancelled, setCancelled] = useState<ReadonlySet<AskBlock>>(new Set());
    const latest = chat.state.messages.at(-1);
    const offered =
        latest?.role === "assistant" && latest.status === "completed" && !chat.busy ? (latest.blocks.find(isAskBlock) ?? null) : null;
    const ask = opened ?? (offered && !closed.has(offered) && !sent.has(offered) ? offered : null);
    const inFlight = chat.state.inFlight;
    useEffect(() => {
        if (inFlight) setOpened(null);
    }, [inFlight]);
    const closeAsk = useCallback(() => {
        if (ask) setClosed((s) => new Set(s).add(ask));
        setOpened(null);
    }, [ask]);

    const leads = useMemo<LeadActions>(
        () => ({ create: (lead) => api.createLead(lead), verify: (id, otp) => api.verifyLead(id, otp), resend: (id) => api.resendLeadCode(id) }),
        [api],
    );

    const actions: BlockActions = useMemo(
        () => ({
            sendMessage: (text) => void chat.send(text),
            busy: chat.busy,
            loadMoreProperties: (query, page, limit) => api.searchProperties(query, { page, limit }),
            openForm: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => setOpened(block),
            formSent: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => sent.has(block),
            formCancelled: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => cancelled.has(block),
            toggleProjectContext: (project) => setProjectContext((items) => items.some(({ id }) => id === project.id) ? items.filter(({ id }) => id !== project.id) : items.length < 3 ? [...items, project] : items),
            isProjectContext: (id) => projectContext.some((project) => project.id === id),
        }),
        [chat.send, chat.busy, api, sent, cancelled, projectContext],
    );

    const rootStyle = {
        ...themeToCssVars(resolvedTheme.tokens),
        colorScheme: resolvedTheme.dark ? "dark" : "light",
        ...style,
    } as CSSProperties;

    const { state } = chat;

    const [historyOpen, setHistoryOpen] = useState(false);

    const rootRef = useRef<HTMLDivElement>(null);
    useContainWheel(rootRef);
    const share = useMemo(() => ({ endpoint: shareEndpoint, user }), [shareEndpoint, user]);

    return (
        <IconProvider value={resolvedIcons}>
            <ShareContext.Provider value={share}>
            <WishlistContext.Provider value={wishlist ?? null}>
            <div ref={rootRef} className={["rec-chat", className].filter(Boolean).join(" ")} style={rootStyle} data-theme={resolvedTheme.dark ? "dark" : "light"}>
                <ChatHeader
                    title={title}
                    subtitle={subtitle}
                    logoUrl={logoUrl}
                    onNewChat={chat.newConversation}
                    onHistory={storageKey === null ? undefined : () => setHistoryOpen(true)}
                    onClose={onClose}
                    busy={chat.busy}
                />

                {historyOpen && (
                    <HistoryPanel
                        currentId={state.conversationId}
                        load={chat.listConversations}
                        onOpen={(id) => {
                            setHistoryOpen(false);
                            setProjectContext([]);
                            setPageAttached(false);
                            chat.openConversation(id);
                        }}
                        onNewChat={() => {
                            setHistoryOpen(false);
                            setProjectContext([]);
                            setPageAttached(false);
                            chat.newConversation();
                        }}
                        onClose={() => setHistoryOpen(false)}
                        phone={phone}
                        onDelete={async (id) => {
                            const wasCurrent = id === state.conversationId;
                            await chat.deleteConversation(id);
                            if (wasCurrent) setProjectContext([]);
                        }}
                    />
                )}

                {state.phase === "error" ? (
                    <div className="rec-messages">
                        <Notice tone="danger">Couldn't connect to the assistant: {state.loadError}</Notice>
                        <button type="button" className="rec-button rec-button--primary" onClick={chat.newConversation}>
                            Try again
                        </button>
                    </div>
                ) : (
                    <MessageList
                        state={state}
                        actions={actions}
                        renderers={renderers}
                        onRetry={chat.retry}
                        onLoadOlder={chat.loadOlder}
                        welcomeMessage={welcomeMessage}
                        suggestions={suggestions}
                    />
                )}

                {ask && state.phase === "ready" && (
                    <AskPanel
                        key={askKey(ask)}
                        block={ask}
                        busy={chat.busy}
                        onAnswer={(text) => {
                            if (chat.send(text)) closeAsk();
                        }}
                        onClose={closeAsk}
                        onCancel={() => {
                            setCancelled((items) => new Set(items).add(ask));
                            setClosed((items) => new Set(items).add(ask));
                            setOpened(null);
                        }}
                        leads={leads}
                        user={user}
                        onSent={() => setSent((s) => new Set(s).add(ask))}
                    />
                )}

                {(!ask || ask.type === "clarification") && (
                    <Composer
                        placeholder={placeholder}
                        busy={chat.busy}
                        disabled={state.phase !== "ready"}
                        validate={chat.validate}
                        onSend={chat.send}
                        onStop={chat.stop}
                        stopping={chat.stopping}
                        projectContext={projectContext}
                        onRemoveProject={(id) => setProjectContext((items) => items.filter((project) => project.id !== id))}
                        page={readPage ? { title: pageTitle ?? "", attached: pageAttached } : undefined}
                        onAttachPage={() => setPageAttached(true)}
                        onRemovePage={() => setPageAttached(false)}
                        draft={draft}
                    />
                )}
            </div>
            </WishlistContext.Provider>
            </ShareContext.Provider>
        </IconProvider>
    );
}
