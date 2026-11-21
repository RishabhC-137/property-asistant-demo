import { ChatWidget, type ThemeDefinition } from "@property-assistant/chat-ui";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const PROPERTY_THEME: ThemeDefinition = {
    base: "light",
    colorPrimary: "#4057f2",
    colorOnPrimary: "#ffffff",
    colorFocus: "#4057f2",
    colorBackground: "#fffdf9",
    colorSurface: "#fffdf9",
    colorSurfaceMuted: "#eef0fb",
    colorText: "#1d2e3d",
    colorTextMuted: "#596779",
    colorBorder: "#dce1ed",
    colorUserBubble: "#4057f2",
    colorOnUserBubble: "#ffffff",
    colorAssistantBubble: "#f0f2fc",
    colorOnAssistantBubble: "#1d2e3d",
    radius: "16px",
    radiusSmall: "11px",
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    shadow: "0 22px 60px rgb(34 47 93 / 20%)",
};

const DEMO_PROJECTS = [
    {
        id: "fixture-0001",
        name: "Aster Vale",
        type: "Apartments",
        location: "Sector 65, Gurugram",
        status: "Under construction",
        details: "2–4 BHK",
        price: "From ₹1.58 Cr",
        image:
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
        imageAlt: "Contemporary home framed by a landscaped garden",
    },
    {
        id: "fixture-0002",
        name: "Morrow Grove",
        type: "Apartments",
        location: "Sector 49, Gurugram",
        status: "Ready to move",
        details: "2–3 BHK",
        price: "From ₹89 Lakh",
        image:
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=85",
        imageAlt: "Bright living room with a balcony-facing seating area",
    },
    {
        id: "fixture-0003",
        name: "Cedar Courtyards",
        type: "Villas",
        location: "Sector 33, Sohna",
        status: "New launch",
        details: "3–4 BHK",
        price: "From ₹2.35 Cr",
        image:
            "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1200&q=85",
        imageAlt: "Low-rise home opening onto a landscaped garden",
    },
    {
        id: "fixture-0004",
        name: "Meridian Workyards",
        type: "Workspaces",
        location: "Sector 44, Gurugram",
        status: "Under construction",
        details: "750–1,800 sq ft",
        price: "From ₹78 Lakh",
        image:
            "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85",
        imageAlt: "Open-plan workspace with shared desks and meeting areas",
    },
] as const;

type Project = (typeof DEMO_PROJECTS)[number];
type ProjectRequest = {
    key: number;
    project: { id: string; name: string };
    text: string;
};

export function App() {
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMounted, setChatMounted] = useState(false);
    const [request, setRequest] = useState<ProjectRequest>();
    const requestKey = useRef(0);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const chatPanelRef = useRef<HTMLElement>(null);
    const heroRef = useRef<HTMLElement>(null);
    const reduceMotion = useReducedMotion() ?? false;
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
    const heroY = useSpring(useTransform(scrollYProgress, [0, 1], [0, 42]), { stiffness: 120, damping: 26 });
    const heroRotateX = useTransform(scrollYProgress, [0, 1], [0, -3]);
    const heroRotateY = useTransform(scrollYProgress, [0, 1], [0, 1.5]);
    const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.07]);

    const openChat = useCallback(() => {
        setChatMounted(true);
        setChatOpen(true);
    }, []);

    const closeChat = useCallback(() => {
        setChatOpen(false);
        window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
    }, []);

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
                            <path d="M5 16.5 18 6l13 10.5v13H5z" />
                            <path d="M14 29.5V19h8v10.5M11 16h.01M25 16h.01" />
                        </svg>
                        <span>Property Desk</span>
                    </a>

                    <nav className="site-nav" aria-label="Main navigation">
                        <a href="#projects">Projects</a>
                        <a href="#how-it-works">How it works</a>
                        <button className="button button--small" type="button" onClick={openChat}>
                            Start a chat
                        </button>
                    </nav>
                </div>
            </header>

            <main id="main-content">
                <motion.section className="hero page-width" id="top" aria-labelledby="hero-title" ref={heroRef}>
                    <motion.div
                        className="hero__copy"
                        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                    >
                        <p className="eyebrow"><span /> Property Desk <span className="eyebrow__divider">/</span> Gurugram</p>
                        <h1 id="hero-title">Your next place starts with <em>one good question.</em></h1>
                        <p className="hero__intro">
                            Tell Property Desk what you have in mind. It asks one helpful question at a time, then helps
                            you compare homes and workspaces around Gurugram.
                        </p>
                        <div className="hero__actions">
                            <button className="button" type="button" onClick={openChat}>
                                Tell us what you need
                            </button>
                            <a className="hero__secondary" href="#projects">Browse sample places</a>
                        </div>
                    </motion.div>

                    <motion.figure
                        className="hero__visual"
                        style={{
                            y: reduceMotion ? 0 : heroY,
                            rotateX: reduceMotion ? 0 : heroRotateX,
                            rotateY: reduceMotion ? 0 : heroRotateY,
                        }}
                    >
                        <div className="hero__depth" aria-hidden="true" />
                        <div className="hero__image-frame">
                            <motion.img
                                src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85"
                                alt="Warm, neutral-toned living room"
                                fetchPriority="high"
                                style={{ scale: reduceMotion ? 1 : heroScale }}
                            />
                        </div>
                        <button
                            className="hero__chat-preview"
                            type="button"
                            onClick={openChat}
                            aria-label="Start a chat about your property search"
                        >
                            <span className="hero__chat-preview-top">
                                <span className="hero__chat-preview-dot" />
                                Property Desk · chat
                            </span>
                            <span className="hero__chat-preview-question">What are you hoping to find?</span>
                            <span className="hero__chat-preview-answer">
                                Tell me a little. I’ll ask one thing at a time.
                            </span>
                            <span className="hero__chat-preview-action">Start a conversation</span>
                        </button>
                        <figcaption>
                            <span>Homes, workspaces, and the details between</span>
                            <span>01 — 04</span>
                        </figcaption>
                    </motion.figure>

                    <motion.div
                        className="hero__footnote"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.35 }}
                    >
                        <span>Illustrative listings · Gurugram, India</span>
                    </motion.div>
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
                                <p className="eyebrow">Sample projects</p>
                                <h2 id="projects-title">Pick a place to ask about.</h2>
                            </div>
                            <p>
                                Choose a project to discuss, or tell Property Desk what you’re looking for. It can compare
                                locations, layouts, prices, and timelines.
                            </p>
                        </motion.div>

                        <div className="project-grid">
                            {DEMO_PROJECTS.map((project, index) => (
                                <motion.article
                                    className="project"
                                    key={project.id}
                                    initial={reduceMotion ? false : { opacity: 0, y: 26, rotateX: -4 }}
                                    whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                    whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.2 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ duration: 0.55, delay: index * 0.07, ease: "easeOut" }}
                                >
                                    <div className="project__image-wrap">
                                        <img
                                            src={project.image}
                                            alt={project.imageAlt}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                        <span className="project__number">0{index + 1}</span>
                                        <span className="project__status">{project.status}</span>
                                    </div>
                                    <div className="project__body">
                                        <p className="project__type">{project.type} <span>·</span> {project.location}</p>
                                        <div className="project__title-row">
                                            <h3>{project.name}</h3>
                                            <p>{project.price}</p>
                                        </div>
                                        <div className="project__footer">
                                            <span>{project.details}</span>
                                            <button
                                                className="text-button"
                                                type="button"
                                                onClick={() => askAboutProject(project)}
                                                aria-label={`Ask Property Desk about ${project.name}`}
                                            >
                                                Ask about this place
                                            </button>
                                        </div>
                                    </div>
                                </motion.article>
                            ))}
                        </div>

                        <p className="projects-note">
                            All project names, prices, locations, and details are fictional examples. The photos are
                            illustrative.
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
                            <p className="eyebrow">A guided search</p>
                            <h2 id="approach-title">No filters. Just tell us what matters.</h2>
                            <p>
                                Start with a location, your budget, or a rough idea. Property Desk asks one useful
                                question at a time and keeps your search focused.
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
                                <h3>Say what matters</h3>
                                <p>Budget, commute, room to grow, or simply a neighbourhood you like.</p>
                            </motion.li>
                            <motion.li
                                initial={reduceMotion ? false : { opacity: 0, y: 18, rotateX: -4 }}
                                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.5 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.5, delay: 0.14, ease: "easeOut" }}
                            >
                                <span className="steps__number">02</span>
                                <h3>Compare the details</h3>
                                <p>See how layouts, locations, prices, and timelines differ.</p>
                            </motion.li>
                            <motion.li
                                initial={reduceMotion ? false : { opacity: 0, y: 18, rotateX: -4 }}
                                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
                                whileHover={reduceMotion ? undefined : { y: -4, rotateY: 1.5 }}
                                viewport={{ once: true, amount: 0.5 }}
                                transition={{ duration: 0.5, delay: 0.23, ease: "easeOut" }}
                            >
                                <span className="steps__number">03</span>
                                <h3>Take your time</h3>
                                <p>Ask a follow-up, request a callback, or come back when you’re ready.</p>
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
                    <p>Fictional demo company and listings. Photography from Unsplash; images are illustrative.</p>
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
