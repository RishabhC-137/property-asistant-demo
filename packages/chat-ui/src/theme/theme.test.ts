import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cssVarName, darkTheme, isDarkColor, lightTheme, resolveTheme, themeToCssVars } from "./theme.js";

describe("themes", () => {
    it("resolves presets and auto", () => {
        assert.deepEqual(resolveTheme("light", true).tokens, lightTheme);
        assert.deepEqual(resolveTheme("dark", false).tokens, darkTheme);
        assert.deepEqual(resolveTheme("auto", true), { tokens: darkTheme, dark: true });
        assert.deepEqual(resolveTheme(undefined, false), { tokens: lightTheme, dark: false });
        assert.deepEqual(resolveTheme("does-not-exist", true).tokens, lightTheme);
    });

    it("applies overrides on a base", () => {
        const { tokens, dark } = resolveTheme({ base: "dark", colorPrimary: "#E11D48", radius: undefined }, false);
        assert.equal(tokens.colorPrimary, "#E11D48");
        assert.equal(tokens.colorBackground, darkTheme.colorBackground);
        assert.equal(tokens.radius, darkTheme.radius, "undefined overrides are ignored");
        assert.equal(dark, true);
    });

    it("supports custom named themes, chained bases and cycles", () => {
        const themes = {
            brand: { base: "light", colorPrimary: "#0047AB" },
            brandNight: { base: "brand", colorBackground: "#0B1020" },
            loopA: { base: "loopB", colorPrimary: "#111111" },
            loopB: { base: "loopA" },
        };
        assert.equal(resolveTheme("brand", false, themes).tokens.colorPrimary, "#0047AB");
        const night = resolveTheme("brandNight", false, themes);
        assert.equal(night.tokens.colorPrimary, "#0047AB");
        assert.equal(night.dark, true, "dark detected from the background colour");
        assert.equal(resolveTheme("loopA", false, themes).tokens.colorPrimary, "#111111");
    });

    it("produces CSS variables", () => {
        assert.equal(cssVarName("colorOnUserBubble"), "--rec-color-on-user-bubble");
        const vars = themeToCssVars(lightTheme);
        assert.equal(vars["--rec-color-primary"], lightTheme.colorPrimary);
        assert.equal(Object.keys(vars).length, Object.keys(lightTheme).length);
    });

    it("detects dark colours", () => {
        assert.equal(isDarkColor("#000"), true);
        assert.equal(isDarkColor("#121614"), true);
        assert.equal(isDarkColor("#FFFFFF"), false);
        assert.equal(isDarkColor("rgb(0,0,0)"), false, "non-hex counts as light");
    });
});
