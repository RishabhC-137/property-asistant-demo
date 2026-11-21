import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameScore, suggestNames } from "../src/modules/properties/name-suggestions.js";

const PROJECTS = [
    { id: "1", name: "Adani The Marq", developer: "Adani Realty" },
    { id: "2", name: "Adani Shantigram", developer: "Adani Realty" },
    { id: "3", name: "Godrej Zenith", developer: "Godrej Properties" },
    { id: "4", name: "Godrej Sora", developer: "Godrej Properties" },
    { id: "5", name: "M3M Antalya Hills", developer: "M3M India" },
    { id: "6", name: "Smartworld Sky Arc", developer: "Smartworld Developers" },
];

const names = (typed: string) => suggestNames(typed, PROJECTS, 4).map((s) => s.name);

describe("did-you-mean name suggestions", () => {
    it("finds projects despite typos, missing words or spaces", () => {
        assert.equal(names("Adani Mark")[0], "Adani The Marq");
        assert.equal(names("godrej zenit")[0], "Godrej Zenith");
        assert.equal(names("godrejzenith")[0], "Godrej Zenith");
        assert.equal(names("antalya hils")[0], "M3M Antalya Hills");
        assert.equal(names("show me the details of antalya")[0], "M3M Antalya Hills", "filler words are ignored");
        assert.equal(names("skyark")[0], "Smartworld Sky Arc", "run together");
        assert.equal(names("marqee")[0], "Adani The Marq");
        assert.equal(names("marquee")[0], "Adani The Marq", "a longer spelling");
    });

    it("suggests a developer for a misspelt developer name", () => {
        assert.ok(names("godrj properties").includes("Godrej Properties"));
        assert.equal(suggestNames("adani realtty", PROJECTS, 4)[0]?.kind, "developer");
    });

    it("leaves out names well behind a clear match", () => {
        const signature = [
            { id: "a", name: "Signature Global Cloverdale SPR", developer: null },
            { id: "b", name: "Signature Global city 79B", developer: null },
            { id: "c", name: "Signature Global Daxin Vistas", developer: null },
        ];
        assert.deepEqual(suggestNames("signature cloverdale", signature, 4).map((s) => s.name), ["Signature Global Cloverdale SPR"]);
    });

    it("offers nothing for names that are not close", () => {
        assert.deepEqual(names("example"), []);
        assert.deepEqual(names("sector 49"), []);
        assert.deepEqual(suggestNames("sector 49", [{ id: "x", name: "Meffier Sector 66", developer: null }], 4), [], "numbers must match");
        assert.equal(nameScore("", "Godrej Sora"), 0);
    });
});
