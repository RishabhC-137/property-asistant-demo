/**
 * Theme tokens become CSS custom properties (`--rec-*`) on the widget root,
 * so a theme only changes variables — never the component code.
 */
export interface ThemeTokens {
    colorPrimary: string;
    colorOnPrimary: string;
    colorBackground: string;
    colorSurface: string;
    colorSurfaceMuted: string;
    colorText: string;
    colorTextMuted: string;
    colorBorder: string;
    colorUserBubble: string;
    colorOnUserBubble: string;
    colorAssistantBubble: string;
    colorOnAssistantBubble: string;
    colorDanger: string;
    colorDangerSurface: string;
    colorNotice: string;
    colorNoticeSurface: string;
    colorFocus: string;
    fontFamily: string;
    fontSize: string;
    radius: string;
    radiusSmall: string;
    shadow: string;
}

export const lightTheme: ThemeTokens = {
    colorPrimary: "#173D35",
    colorOnPrimary: "#FFFFFF",
    colorBackground: "#FFFFFF",
    colorSurface: "#FFFFFF",
    colorSurfaceMuted: "#F4F5F3",
    colorText: "#1E2420",
    colorTextMuted: "#5E6862",
    colorBorder: "#E1E4E0",
    colorUserBubble: "#173D35",
    colorOnUserBubble: "#FFFFFF",
    colorAssistantBubble: "#F4F5F3",
    colorOnAssistantBubble: "#1E2420",
    colorDanger: "#A3231B",
    colorDangerSurface: "#FCEBEA",
    colorNotice: "#6B4E00",
    colorNoticeSurface: "#FFF6DB",
    colorFocus: "#2F7D6B",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSize: "15px",
    radius: "16px",
    radiusSmall: "10px",
    shadow: "0 8px 30px rgba(20, 30, 25, 0.12)",
};

export const darkTheme: ThemeTokens = {
    ...lightTheme,
    colorPrimary: "#5FC4A8",
    colorOnPrimary: "#0D1F1A",
    colorBackground: "#121614",
    colorSurface: "#1A1F1C",
    colorSurfaceMuted: "#232A26",
    colorText: "#E8ECE9",
    colorTextMuted: "#9AA6A0",
    colorBorder: "#2E3632",
    colorUserBubble: "#2A6B5B",
    colorOnUserBubble: "#FFFFFF",
    colorAssistantBubble: "#232A26",
    colorOnAssistantBubble: "#E8ECE9",
    colorDanger: "#FF8A80",
    colorDangerSurface: "#3A1D1B",
    colorNotice: "#F5D27A",
    colorNoticeSurface: "#33290F",
    colorFocus: "#7FD8BE",
    shadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
};

/** Built-in presets. */
export const builtInThemes: Readonly<Record<string, ThemeTokens>> = {
    light: lightTheme,
    dark: darkTheme,
};

/** A named theme you add: full tokens, or overrides on top of a base theme. */
export type ThemeDefinition = ThemeTokens | (Partial<ThemeTokens> & { base?: string });

/**
 * What the `theme` prop accepts:
 *  - `"light"`, `"dark"`, `"auto"` (follows the OS), or a name from the `themes` prop
 *  - tokens to override, optionally on a base: `{ base: "dark", colorPrimary: "#E11D48" }`
 */
export type ThemeInput = string | (Partial<ThemeTokens> & { base?: string });

export interface ResolvedTheme {
    tokens: ThemeTokens;
    /** Derived from the background colour; drives `color-scheme` for inputs/scrollbars. */
    dark: boolean;
}

const definedOnly = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Merges a theme input into a complete token set.
 * Unknown names fall back to light; definitions may chain bases (cycles are cut).
 */
export function resolveTheme(
    input: ThemeInput | undefined,
    prefersDark: boolean,
    themes: Readonly<Record<string, ThemeDefinition>> = {},
): ResolvedTheme {
    const byName = (name: string | undefined, seen: Set<string>): ThemeTokens => {
        if (!name || name === "auto") return prefersDark ? darkTheme : lightTheme;
        if (seen.has(name)) return lightTheme;
        seen.add(name);
        const custom = themes[name];
        if (custom) {
            const { base, ...overrides } = custom as Partial<ThemeTokens> & { base?: string };
            return { ...byName(base ?? "light", seen), ...definedOnly(overrides) };
        }
        return builtInThemes[name] ?? lightTheme;
    };

    let tokens: ThemeTokens;
    if (input === undefined || typeof input === "string") {
        tokens = { ...byName(input, new Set()) };
    } else {
        const { base, ...overrides } = input;
        tokens = { ...byName(base, new Set()), ...definedOnly(overrides) };
    }
    return { tokens, dark: isDarkColor(tokens.colorBackground) };
}

/** Rough luminance test for #rgb / #rrggbb colours; other formats count as light. */
export function isDarkColor(color: string): boolean {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
    if (!hex) return false;
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** "colorPrimary" → "--rec-color-primary" */
export const cssVarName = (token: string) => `--rec-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
    return Object.fromEntries(Object.entries(tokens).map(([key, value]) => [cssVarName(key), value]));
}
