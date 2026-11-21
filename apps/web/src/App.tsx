import { ChatWidget, createChatApi, type ThemeDefinition } from "@property-assistant/chat-ui";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const projectsApi = createChatApi(API_BASE_URL);
const EMPTY_PROJECT_QUERY = {
    keywords: null,
    bedrooms: null,
    budgetMinInr: null,
    budgetMaxInr: null,
    category: null,
    nearProjectId: null,
    withinKm: null,
};

const PROJECT_CATEGORIES = ["All", "Apartments", "Villas", "Offices", "Retail", "Plots", "Warehouses"] as const;
type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
type Project = Awaited<ReturnType<typeof projectsApi.searchProperties>>["data"][number];
type ProjectStatus = "loading" | "ready" | "error";

const PROPERTY_THEME: ThemeDefinition = {
    base: "light",
    colorPrimary: "#252422",
    colorOnPrimary: "#fffcf2",
    colorFocus: "#403d39",
    colorBackground: "#fffcf2",
    colorSurface: "#fffcf2",
    colorSurfaceMuted: "#ccc5b9",
    colorText: "#252422",
    colorTextMuted: "#403d39",
    colorBorder: "#ccc5b9",
    colorUserBubble: "#eb5e28",
    colorOnUserBubble: "#252422",
    colorAssistantBubble: "#fffcf2",
    colorOnAssistantBubble: "#252422",
    radius: "0px",
    radiusSmall: "0px",
    fontFamily: '"Onest", ui-sans-serif, system-ui, sans-serif',
    shadow: "14px 14px 0 #ccc5b9",
};

type ProjectRequest = {
    key: number;
    project: { id: string; name: string };
    text: string;
};

function getProjectCategory(project: Project): Exclude<ProjectCategory, "All"> {
    const type = project.propertyTypes.join(" ").toLowerCase();
    if (type.includes("villa")) return "Villas";
    if (type.includes("office") || type.includes("workspace")) return "Offices";
    if (type.includes("retail") || type.includes("shop")) return "Retail";
    if (type.includes("plot") || type.includes("land")) return "Plots";
    if (type.includes("warehouse") || type.includes("industrial")) return "Warehouses";
    return "Apartments";
}

function projectPrice(project: Project): string {
    const minimum = project.price?.min;
    if (minimum === null || minimum === undefined) return "Price on request";
    if (minimum >= 10_000_000) {
        const crore = (minimum / 10_000_000).toFixed(2).replace(/\.?0+$/, "");
        return `From ₹${crore} Cr`;
    }
    const lakh = (minimum / 100_000).toFixed(0);
    return `From ₹${lakh} Lakh`;
}

export function App() {
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMounted, setChatMounted] = useState(false);
    const [request, setRequest] = useState<ProjectRequest>();
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectsStatus, setProjectsStatus] = useState<ProjectStatus>("loading");
    const [activeProjectCategory, setActiveProjectCategory] = useState<ProjectCategory>("All");
    const [projectQuery, setProjectQuery] = useState("");
    const [visibleProjectCount, setVisibleProjectCount] = useState(8);
    const [projectReloadKey, setProjectReloadKey] = useState(0);
    const requestKey = useRef(0);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const chatPanelRef = useRef<HTMLElement>(null);
    const reduceMotion = useReducedMotion() ?? false;

    const openChat = useCallback(() => {
        setChatMounted(true);
        setChatOpen(true);
    }, []);

    const closeChat = useCallback(() => {
        setChatOpen(false);
        window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
    }, []);

    const retryProjects = useCallback(() => setProjectReloadKey((key) => key + 1), []);

    const askAboutProject = useCallback(
        (project: Project) => {
            requestKey.current += 1;
            setRequest({
                key: requestKey.current,
                project: { id: project.id, name: project.name },
                text: `Tell me about ${project.name}`,
            });
            openChat();
        },
        [openChat],
    );

    useEffect(() => {
        if (request) setRequest(undefined);
    }, [request]);

    useEffect(() => {
        let cancelled = false;

        const loadProjects = async () => {
            setProjectsStatus("loading");
            try {
                const firstPage = await projectsApi.searchProperties(EMPTY_PROJECT_QUERY, { page: 1, limit: 12 });
                const allProjects = [...firstPage.data];
                let hasMore = firstPage.pagination.hasMore;

                for (let page = 2; hasMore; page += 1) {
                    if (page > 50) throw new Error("Project catalogue exceeded the supported page limit.");
                    const nextPage = await projectsApi.searchProperties(EMPTY_PROJECT_QUERY, { page, limit: 12 });
                    allProjects.push(...nextPage.data);
                    hasMore = nextPage.pagination.hasMore;
                }

                if (!cancelled) {
                    setProjects(allProjects);
                    setProjectsStatus("ready");
                }
            } catch (error) {
                console.error("Could not load projects from the API", error);
                if (!cancelled) setProjectsStatus("error");
            }
        };

        void loadProjects();
        return () => {
            cancelled = true;
        };
    }, [projectReloadKey]);

    useEffect(() => {
        if (!chatOpen) return;
        const input = chatPanelRef.current?.querySelector<HTMLElement>("textarea, input");
        input?.focus({ preventScroll: true });

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.isComposing) closeChat();
        };
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [chatOpen, closeChat]);

    return (
        <div className="app">
            <a className="skip-link" href="#main-content">
                Skip to content
            </a>

            <header className="site-header">
                <div className="site-header__inner">
                    <a className="brand" href="#top" aria-label="Property Desk home">
                        <svg viewBox="0 0 36 36" aria-hidden="true">
                            <path d="M5 7h26v22H5z" />
                            <path d="M5 14h26M12 14v15" />
                            <path d="M18 7v7" />
                        </svg>
                        <span>Property Desk</span>
                    </a>

                    <nav className="site-nav" aria-label="Main navigation">
                        <a href="#projects">Sample projects</a>
                        <a href="#how-it-works">How it works</a>
                        <button className="button button--small" type="button" onClick={openChat}>
                            Start a chat
                        </button>
                    </nav>
                </div>
            </header>

            <main id="main-content">
                <motion.section className="hero page-width" id="top" aria-labelledby="hero-title">
                    <motion.div
                        className="hero__copy"
                        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                    >
                        <h1 id="hero-title">Find your place. Start with a question.</h1>
                        <p className="hero__intro">
                            Tell us what you need. Then compare homes and workspaces around Gurugram.
                        </p>
                        <div className="hero__actions">
                            <button className="button" type="button" onClick={openChat}>
                                Start a chat
                            </button>
                            <a className="hero__secondary" href="#projects">Explore sample projects</a>
                        </div>
                    </motion.div>

                    <motion.figure
                        className="hero__visual"
                        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.75, delay: 0.12, ease: "easeOut" }}
                    >
                        <div className="hero__image-frame">
                            <img
                                src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85"
                                alt="Warm, neutral-toned living room"
                                fetchPriority="high"
                                decoding="async"
                            />
                            <span className="hero__image-index">
                                {projectsStatus === "ready" ? `${projects.length} sample projects` : "Projects via API"}
                            </span>
                        </div>
                        <figcaption>
                            <span>Illustrative home</span>
                            <span>Gurugram, India</span>
                        </figcaption>
                    </motion.figure>

                    <div className="hero__footnote">
                        <span>Residential and commercial property</span>
                        <span>Start anywhere. We’ll ask what matters next.</span>
                    </div>
                </motion.section>

                <section className="projects-section" id="projects" aria-labelledby="projects-title">
                    <div className="page-width">
                        <motion.div
                            className="section-heading"
                            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.35 }}
                            transition={{ duration: 0.55, ease: "easeOut" }}
                        >
                            <div>
                                <h2 id="projects-title">Explore a few places first.</h2>
                            </div>
                            <p>
                                Browse six property types. The gallery and assistant search use the same API catalogue.
                            </p>
                        </motion.div>

                        <div className="project-controls">
                            <label className="project-search">
                                <span>Find a project</span>
                                <input
                                    type="search"
                                    value={projectQuery}
                                    onChange={(event) => {
                                        setProjectQuery(event.target.value);
                                        setVisibleProjectCount(8);
                                    }}
                                    placeholder="Name, area or property type"
                                />
                            </label>
                            <div className="project-filters" aria-label="Filter projects by type">
                                {PROJECT_CATEGORIES.map((category) => {
                                    const count =
                                        category === "All"
                                            ? projects.length
                                            : projects.filter((project) => getProjectCategory(project) === category).length;
                                    return (
                                        <button
                                            className="project-filter"
                                            key={category}
                                            type="button"
                                            aria-pressed={activeProjectCategory === category}
                                            onClick={() => {
                                                setActiveProjectCategory(category);
                                                setVisibleProjectCount(8);
                                            }}
                                        >
                                            {category} <span>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {projectsStatus === "loading" && (
                            <p className="project-feedback" role="status">Loading sample projects from the API…</p>
                        )}
                        {projectsStatus === "error" && (
                            <div className="project-feedback project-feedback--error" role="alert">
                                <p>Couldn’t load projects from the API. Check that the backend is running, then retry.</p>
                                <button className="text-button" type="button" onClick={retryProjects}>Retry</button>
                            </div>
                        )}

                        {projectsStatus === "ready" && (() => {
                            const query = projectQuery.trim().toLowerCase();
                            const filteredProjects = projects.filter((project) => {
                                if (activeProjectCategory !== "All" && getProjectCategory(project) !== activeProjectCategory) return false;
                                if (!query) return true;
                                const searchable = [
                                    project.name,
                                    project.location.localityName,
                                    project.location.city,
                                    ...project.propertyTypes,
                                    project.status,
                                    ...project.configurations.map((configuration) => configuration.label),
                                ]
                                    .filter(Boolean)
                                    .join(" ")
                                    .toLowerCase();
                                return searchable.includes(query);
                            });
                            const visibleProjects = filteredProjects.slice(0, visibleProjectCount);

                            return (
                                <>
                                    <p className="project-result-count" aria-live="polite">
                                        {filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"}
                                    </p>
                                    {filteredProjects.length === 0 ? (
                                        <p className="project-feedback">No projects match that search. Try another name, area or type.</p>
                                    ) : (
                        <div className="project-grid">
                            {visibleProjects.map((project, index) => (
                                <motion.article
                                    className="project"
                                    key={project.id}
                                    initial={reduceMotion ? false : { opacity: 0, y: 26, rotateX: -4 }}
                                    whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ duration: 0.55, delay: Math.min(index, 5) * 0.07, ease: "easeOut" }}
                                >
                                    <div className="project__image-wrap">
                                        {project.image?.url && (
                                            <img
                                                src={project.image.url}
                                                alt={project.image.alt}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        )}
                                        <span className="project__number">{String(index + 1).padStart(2, "0")}</span>
                                        <span className="project__status">{project.status ?? "Sample listing"}</span>
                                    </div>
                                    <div className="project__body">
                                        <p className="project__type">
                                            {getProjectCategory(project)} <span>·</span>{" "}
                                            {[project.location.localityName, project.location.city].filter(Boolean).join(", ")}
                                        </p>
                                        <div className="project__title-row">
                                            <h3>{project.name}</h3>
                                            <p>{projectPrice(project)}</p>
                                        </div>
                                        <div className="project__footer">
                                            <span>{project.configurations.map((configuration) => configuration.label).join(" · ")}</span>
                                            <button
                                                className="text-button"
                                                type="button"
                                                onClick={() => askAboutProject(project)}
                                                aria-label={`Ask Property Desk about ${project.name}`}
                                            >
                                                Ask about this project
                                            </button>
                                        </div>
                                    </div>
                                </motion.article>
                            ))}
                        </div>
                                    )}
                                    {visibleProjectCount < filteredProjects.length && (
                                        <button
                                            className="button project-load-more"
                                            type="button"
                                            onClick={() => setVisibleProjectCount((count) => count + 8)}
                                        >
                                            Show more projects
                                        </button>
                                    )}
                                </>
                            );
                        })()}

                        <p className="projects-note">
                            Project names, prices, locations, and details are fictional. Photos are illustrative. The assistant searches this same API catalogue.
                        </p>
                    </div>
                </section>

                <section className="approach-section" id="how-it-works" aria-labelledby="approach-title">
                    <div className="page-width approach">
                        <motion.div
                            className="approach__intro"
                            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.35 }}
                            transition={{ duration: 0.55, ease: "easeOut" }}
                        >
                            <h2 id="approach-title">One useful question at a time.</h2>
                            <p>
                                Share a location, a budget, or a rough idea. We’ll ask a focused follow-up, then keep
                                the search moving.
                            </p>
                            <button className="approach__link" type="button" onClick={openChat}>
                                Start a chat
                            </button>
                        </motion.div>
                        <ol className="steps">
                            <motion.li
                                initial={reduceMotion ? false : { opacity: 0, y: 18, rotateX: -4 }}
                                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.5 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
                            >
                                <span className="steps__number">01</span>
                                <h3>Share the brief</h3>
                                <p>Your budget, the area, or a detail that matters to you.</p>
                            </motion.li>
                            <motion.li
                                initial={reduceMotion ? false : { opacity: 0, y: 18, rotateX: -4 }}
                                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.5 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.5, delay: 0.14, ease: "easeOut" }}
                            >
                                <span className="steps__number">02</span>
                                <h3>Narrow it down</h3>
                                <p>Answer a follow-up. Compare layouts, locations, and prices.</p>
                            </motion.li>
                            <motion.li
                                initial={reduceMotion ? false : { opacity: 0, y: 18, rotateX: -4 }}
                                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.5 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.5, delay: 0.23, ease: "easeOut" }}
                            >
                                <span className="steps__number">03</span>
                                <h3>Choose a next step</h3>
                                <p>Keep exploring, arrange a visit, or ask for a callback.</p>
                            </motion.li>
                        </ol>
                    </div>
                </section>
            </main>

            <footer className="site-footer">
                <div className="page-width site-footer__inner">
                    <a className="brand brand--footer" href="#top">
                        <svg viewBox="0 0 36 36" aria-hidden="true">
                            <path d="M5 16.5 18 6l13 10.5v13H5z" />
                            <path d="M14 29.5V19h8v10.5M11 16h.01M25 16h.01" />
                        </svg>
                        <span>Property Desk</span>
                    </a>
                    <p>Fictional demo company and listings. Unsplash photography is illustrative.</p>
                </div>
            </footer>

            {chatMounted && (
                <section
                    className="chat-panel"
                    id="property-desk-chat"
                    aria-label="Chat with Property Desk"
                    hidden={!chatOpen}
                    ref={chatPanelRef}
                >
                    <ChatWidget
                        apiBaseUrl={API_BASE_URL}
                        theme={PROPERTY_THEME}
                        title="Property Desk"
                        subtitle="One question at a time"
                        placeholder="Ask about a place, budget, or location…"
                        welcomeMessage="Tell me a little about what you’re looking for. I’ll ask one question at a time, then help you compare sample projects or find a next step."
                        suggestions={[
                            "Show me 2 BHK homes under ₹1 crore",
                            "Compare the sample projects",
                            "What’s near Sector 65?",
                        ]}
                        request={request}
                        onClose={closeChat}
                    />
                </section>
            )}

            <button
                className={`chat-launcher${chatOpen ? " chat-launcher--open" : ""}`}
                type="button"
                onClick={chatOpen ? closeChat : openChat}
                aria-label={chatOpen ? "Close chat" : "Start a chat with Property Desk"}
                aria-expanded={chatOpen}
                aria-controls={chatMounted ? "property-desk-chat" : undefined}
                ref={launcherRef}
            >
                {chatOpen ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6a7.5 7.5 0 1 1 17-3.5Z" />
                        <path d="M8 11.5h8M8 14.5h5" />
                    </svg>
                )}
                <span>{chatOpen ? "Close chat" : "Start a chat"}</span>
            </button>
        </div>
    );
}
