import { CreateLeadRequestSchema, LeadParamsSchema, VerifyLeadRequestSchema, type Lead } from "@property-assistant/contracts";
import type { FastifyInstance } from "fastify";
import { parseInput } from "../lib/errors.js";
import type { LeadService } from "../modules/leads/lead.service.js";

export interface LeadRoutesOptions {
    leads: LeadService;
}

/** Callback and site-visit requests from the chat's forms. Bodies are never logged. */
export async function leadRoutes(app: FastifyInstance, options: LeadRoutesOptions) {
    const { leads } = options;

    app.post("/api/v1/leads", async (request, reply): Promise<{ data: Lead }> => {
        const input = parseInput(CreateLeadRequestSchema, request.body, "body");
        const lead = await leads.create(input, request.ip);
        reply.code(201);
        return { data: lead };
    });

    app.post("/api/v1/leads/:leadId/verify", async (request): Promise<{ data: Lead }> => {
        const { leadId } = parseInput(LeadParamsSchema, request.params, "path");
        const { otp } = parseInput(VerifyLeadRequestSchema, request.body, "body");
        return { data: await leads.verify(leadId, otp) };
    });

    app.post("/api/v1/leads/:leadId/resend", async (request): Promise<{ data: Lead }> => {
        const { leadId } = parseInput(LeadParamsSchema, request.params, "path");
        return { data: await leads.resend(leadId, request.ip) };
    });
}
