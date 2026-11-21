import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bedroomCount, DEFAULT_STARTER_STEPS, NO_BEDROOM_TYPES, starterMessage } from "./StarterQuestions.js";

describe("starter questions", () => {
    it("reads a bedroom count from a chip or the stepper", () => {
        assert.equal(bedroomCount("3 BHK"), 3);
        assert.equal(bedroomCount("5 BHK+"), 5);
        assert.equal(bedroomCount(undefined), null);
        assert.equal(bedroomCount("Plot"), null);
    });

    it("sends a stepper-chosen bedroom count like a typed request", () => {
        assert.equal(
            starterMessage({ purpose: "Buy a home", type: "Villa", bedrooms: "6 BHK", locality: "Sohna Road" }),
            "I'm looking to buy a 6 BHK villa on Sohna Road.",
        );
    });

    it("offers the website's property types, and skips bedrooms where they mean nothing", () => {
        const types = DEFAULT_STARTER_STEPS.find((step) => step.id === "type")!.options;
        for (const type of ["Independent house", "Penthouse", "Studio apartment", "Office space", "Retail shop"]) assert.ok(types.includes(type));
        for (const type of NO_BEDROOM_TYPES) assert.ok(types.includes(type), type);
        assert.equal(starterMessage({ type: "Office space", bedrooms: "3 BHK" }), "I'm looking to buy an office space in Gurugram.");
        assert.equal(starterMessage({ purpose: "Invest", type: "Independent house" }), "I want to invest in an independent house in Gurugram.");
        assert.equal(starterMessage({ type: "Penthouse", bedrooms: "4 BHK" }), "I'm looking to buy a 4 BHK penthouse in Gurugram.");
    });
});
