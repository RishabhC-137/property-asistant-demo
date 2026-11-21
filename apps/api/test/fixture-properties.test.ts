import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PropertyPage } from "@property-assistant/contracts";
import { MockChatProvider } from "@property-assistant/llm";
import { buildApp } from "../src/app.js";
import { FixturePropertyService } from "../src/modules/properties/fixture.service.js";

describe("fixture property service", () => {
    it("searches the same studio projects by type, area and budget", async () => {
        const service = new FixturePropertyService();
        const result = await service.search({
            text: "studio Golf Course Ext. Road",
            budgetMinInr: 15_000_000,
            budgetMaxInr: 30_000_000,
            limit: 12,
        });

        assert.deepEqual(result.items.map((project) => project.name), ["Fernlight", "Olive Quarter", "Luma Residences"]);
        assert.ok(result.items.every((project) => project.source === "fixture"));
    });

    it("serves all 50 projects through the public, paginated API route", async () => {
        const app = buildApp({
            logger: false,
            properties: new FixturePropertyService(),
            provider: new MockChatProvider(),
        });

        try {
            const projects: string[] = [];
            for (let page = 1; page <= 5; page += 1) {
                const response = await app.inject({ method: "GET", url: `/api/v1/properties?page=${page}&limit=12` });
                assert.equal(response.statusCode, 200, response.body);
                const body = response.json() as PropertyPage;
                projects.push(...body.data.map((project) => project.id));
                assert.equal(body.pagination.total, 50);
            }

            assert.equal(projects.length, 50);
            assert.equal(new Set(projects).size, 50);
        } finally {
            await app.close();
        }
    });
});
