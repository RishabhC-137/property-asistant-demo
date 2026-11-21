import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogLeadGateway, LeadService } from "../src/modules/leads/lead.service.js";
import { testApp } from "./helpers.js";

/** A stand-in for the website's enquiry API: code 123456 is right. */
function website() {
    const calls: Array<{ path: string; body: Record<string, unknown>; ip: string | null }> = [];
    const fetch: typeof globalThis.fetch = (async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ path, body, ip: (init.headers as Record<string, string>)["x-forwarded-for"] ?? null });
        if (path === "/api/enquiry/create") {
            return Response.json({ success: true, requestId: "665f00000000000000000001", sentTo: ["phone"], phoneMasked: "+91 •••••• 3210" });
        }
        if (body.otp === "123456") return Response.json({ success: true, data: { verifiedBy: "phone" } });
        return Response.json({ success: false, error: "That code is not right. 4 attempts left." }, { status: 400 });
    }) as typeof fetch;
    const leads = new LeadService(new CatalogLeadGateway({ apiBaseUrl: "https://site.example/api", timeoutMs: 1000, fetch }));
    return { calls, app: testApp({ leads }) };
}

const visit = {
    requestType: "site_visit",
    projectIds: ["665f0000000000000000aaaa"],
    name: "Asha Rao",
    phone: "98765 43210",
    visitDate: "2026-11-02",
    visitTime: "11:00",
    transportMode: "cab",
};

describe("leads", () => {
    it("sends a site visit to the website and confirms it with the code", async () => {
        const { calls, app } = website();
        const created = await app.inject({ method: "POST", url: "/api/v1/leads", payload: visit });
        assert.equal(created.statusCode, 201);
        const lead = created.json().data;
        assert.deepEqual([lead.phoneMasked, lead.verified], ["+91 •••••• 3210", false]);
        assert.equal(calls[0]?.path, "/api/enquiry/create");
        assert.deepEqual(
            [calls[0]?.body.requestType, calls[0]?.body.source, calls[0]?.body.otpChannel, calls[0]?.body.selectedProjects],
            ["site-visit", "chatbot", "whatsapp", ["665f0000000000000000aaaa"]],
        );
        assert.ok(!JSON.stringify(lead).includes("665f00000000000000000001"), "the website's id stays on the server");

        const wrong = await app.inject({ method: "POST", url: `/api/v1/leads/${lead.leadId}/verify`, payload: { otp: "000000" } });
        assert.equal(wrong.statusCode, 400);
        assert.equal(wrong.json().error.message, "That code is not right. 4 attempts left.");

        const resent = await app.inject({ method: "POST", url: `/api/v1/leads/${lead.leadId}/resend` });
        assert.equal(resent.statusCode, 200);
        assert.deepEqual(calls.at(-1)?.body, { requestId: "665f00000000000000000001", otpChannel: "whatsapp" });

        const ok = await app.inject({ method: "POST", url: `/api/v1/leads/${lead.leadId}/verify`, payload: { otp: "123456" } });
        assert.equal(ok.json().data.verified, true);
        const again = await app.inject({ method: "POST", url: `/api/v1/leads/${lead.leadId}/verify`, payload: { otp: "123456" } });
        assert.equal(again.statusCode, 400, "only once");
    });

    it("keeps a project typed in the chatbot through verification", async () => {
        const { calls, app } = website();
        const created = await app.inject({
            method: "POST",
            url: "/api/v1/leads",
            payload: { ...visit, projectIds: [], projectName: "Property Desk Residences" },
        });
        assert.equal(created.statusCode, 201);
        const lead = created.json().data;
        assert.equal(calls[0]?.body.projectName, "Property Desk Residences");

        const verified = await app.inject({ method: "POST", url: `/api/v1/leads/${lead.leadId}/verify`, payload: { otp: "123456" } });
        assert.equal(verified.statusCode, 200);
        assert.deepEqual(calls.at(-1)?.body, {
            requestId: "665f00000000000000000001",
            otp: "123456",
            projectName: "Property Desk Residences",
        });
    });

    it("sends an online presentation with its meeting platform", async () => {
        const { calls, app } = website();
        const created = await app.inject({
            method: "POST",
            url: "/api/v1/leads",
            payload: {
                requestType: "online_presentation",
                projectIds: ["665f0000000000000000aaaa"],
                name: "Asha Rao",
                phone: "98765 43210",
                email: "asha@example.com",
                visitDate: "2026-11-02",
                visitTime: "11:00",
                meetingPlatform: "google-meet",
            },
        });

        assert.equal(created.statusCode, 201);
        assert.deepEqual(
            [calls[0]?.body.requestType, calls[0]?.body.selectedProjects, calls[0]?.body.meetingPlatform],
            ["online-presentation", ["665f0000000000000000aaaa"], "google-meet"],
        );
        assert.equal(calls[0]?.body.transportMode, undefined);
    });

    it("checks details first, and refuses unknown leads and too many requests", async () => {
        const { calls, app } = website();
        const noTime = await app.inject({ method: "POST", url: "/api/v1/leads", payload: { ...visit, visitTime: undefined } });
        assert.equal(noTime.statusCode, 400);
        const badPhone = await app.inject({ method: "POST", url: "/api/v1/leads", payload: { ...visit, phone: "12" } });
        assert.equal(badPhone.statusCode, 400);
        assert.equal(calls.length, 0, "nothing sent for invalid details");

        const unknown = await app.inject({ method: "POST", url: "/api/v1/leads/7d3c3c7e-6a1b-4f7c-9d55-1c2d3e4f5a6b/verify", payload: { otp: "123456" } });
        assert.equal(unknown.statusCode, 404);

        for (let i = 0; i < 5; i++) await app.inject({ method: "POST", url: "/api/v1/leads", payload: visit });
        const sixth = await app.inject({ method: "POST", url: "/api/v1/leads", payload: visit });
        assert.equal(sixth.statusCode, 429);
        assert.equal(sixth.json().error.code, "RATE_LIMITED");
    });

    it("says sending is unavailable when leads are disabled", async () => {
        const app = testApp({ leads: new LeadService(null) });
        const res = await app.inject({ method: "POST", url: "/api/v1/leads", payload: visit });
        assert.equal(res.statusCode, 503);
    });
});
