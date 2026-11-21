import type { ThemeDefinition } from "@property-assistant/chat-ui";

/**
 * Example custom themes, passed to the widget's `themes` prop and selected
 * with `theme="<name>"`. Each overrides only what it needs on top of a base.
 */
export const CUSTOM_THEMES: Record<string, ThemeDefinition> = {
    propertyGold: {
        base: "light",
        colorPrimary: "#8A5A00",
        colorUserBubble: "#8A5A00",
        colorFocus: "#B87A0B",
        colorSurfaceMuted: "#FBF6EC",
        colorAssistantBubble: "#FBF6EC",
        radius: "10px",
        radiusSmall: "6px",
    },
    midnight: {
        base: "dark",
        colorPrimary: "#8AB4FF",
        colorOnPrimary: "#0B1220",
        colorBackground: "#0B1220",
        colorSurface: "#111A2E",
        colorSurfaceMuted: "#18233B",
        colorAssistantBubble: "#18233B",
        colorUserBubble: "#2F5BD3",
        colorBorder: "#22304F",
        fontFamily: '"Georgia", "Times New Roman", serif',
    },
};

export const THEME_OPTIONS = [
    { value: "auto", label: "Auto (follows OS)" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "propertyGold", label: "Custom: Property Gold" },
    { value: "midnight", label: "Custom: Midnight" },
];
