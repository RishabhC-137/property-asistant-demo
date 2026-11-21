import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    formatDate,
    formatInr,
    formatMonthYear,
    formatPricePerSqft,
    formatPriceRange,
    formatPriceRangeShort,
    formatSize,
} from "./format.js";

describe("format", () => {
    it("formats INR in crore and lakh", () => {
        assert.equal(formatInr(35_700_000), "₹3.57 Cr");
        assert.equal(formatInr(50_000_000), "₹5 Cr");
        assert.equal(formatInr(4_500_000), "₹45 L");
        assert.equal(formatInr(95_000), "₹95,000");
    });

    it("formats price ranges without inventing bounds", () => {
        const r = (min: number | null, max: number | null) => ({ currency: "INR" as const, min, max, pricePerSqft: 17_000 });
        assert.equal(formatPriceRange(r(35_700_000, 51_000_000)), "₹3.57 Cr – ₹5.1 Cr");
        assert.equal(formatPriceRange(r(25_000_000, null)), "From ₹2.5 Cr");
        assert.equal(formatPriceRangeShort(r(40_000_000, 42_400_000)), "₹4.00 – 4.24 Cr");
        assert.equal(formatPriceRangeShort(r(8_500_000, 12_000_000)), "₹85 L – ₹1.20 Cr", "mixed units stay explicit");
        assert.equal(formatPriceRangeShort(r(25_000_000, null)), "From ₹2.50 Cr");
        assert.equal(formatPriceRangeShort(r(25_000_000, 25_000_000)), "₹2.50 Cr");
        assert.equal(formatPriceRangeShort(null), "Price on request");
        assert.equal(formatSize({ min: 200, max: 240, unit: "sqyd" }), "200 – 240 sq. yd.");
        assert.equal(formatMonthYear("2029-10-31"), "Oct 2029");
        assert.equal(formatMonthYear(null), null);
        assert.equal(formatPriceRange(r(null, 25_000_000)), "Up to ₹2.5 Cr");
        assert.equal(formatPriceRange(r(25_000_000, 25_000_000)), "₹2.5 Cr");
        assert.equal(formatPriceRange(null), "Price on request");
        assert.equal(formatPricePerSqft(r(1, 2)), "₹17,000/sq ft");
    });

    it("formats sizes and dates", () => {
        assert.equal(formatSize({ min: 2100, max: 2500, unit: "sqft" }), "2,100 – 2,500 sq. ft.");
        assert.equal(formatSize({ min: 1900, max: null, unit: "sqft" }), "1,900 sq. ft.");
        assert.equal(formatSize(null), null);
        assert.equal(formatDate("2031-08-31"), "31 Aug 2031");
        assert.equal(formatDate(null), null);
        assert.equal(formatDate("nope"), null);
    });
});
