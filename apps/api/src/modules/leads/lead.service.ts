import { randomUUID } from "node:crypto";
import type { CreateLeadRequest, Lead } from "@property-assistant/contracts";
import { AppError } from "../../lib/errors.js";

/**
 * Where leads go. The website's enquiry API takes a request in two calls:
 * `start` saves it and sends a code (or, with a `requestId`, sends a new one),
 * `verify` checks the code and passes the lead to the sales team.
 */
export interface LeadGateway {
    start(body: Record<string, unknown>, clientIp: string): Promise<{ requestId: string; phoneMasked: string }>;
    verify(requestId: string, otp: string, projectName?: string): Promise<void>;
}

/** Calls `{apiBaseUrl}/enquiry/create` and `/enquiry/verify-otp` on the Property Desk website. */
export class CatalogLeadGateway implements LeadGateway {
    constructor(
        private readonly options: { apiBaseUrl: string; timeoutMs: number; fetch?: typeof fetch },
    ) {}

    async start(body: Record<string, unknown>, clientIp: string) {
        const data = await this.post("/enquiry/create", body, clientIp);
        if (typeof data.requestId !== "string" || typeof data.phoneMasked !== "string") {
            throw new AppError(503, "SERVICE_UNAVAILABLE", "Requests can't be sent right now. Please try again.", { retryable: true });
        }
        return { requestId: data.requestId, phoneMasked: data.phoneMasked };
    }

    async verify(requestId: string, otp: string, projectName?: string) {
        await this.post("/enquiry/verify-otp", { requestId, otp, ...(projectName ? { projectName } : {}) }, null);
    }

    private async post(path: string, body: unknown, clientIp: string | null): Promise<Record<string, unknown>> {
        let response: Response;
        try {
            response = await (this.options.fetch ?? fetch)(`${this.options.apiBaseUrl}${path}`, {
                method: "POST",
                headers: { "content-type": "application/json", ...(clientIp ? { "x-forwarded-for": clientIp } : {}) },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(this.options.timeoutMs),
            });
        } catch {
            throw new AppError(503, "SERVICE_UNAVAILABLE", "Requests can't be sent right now. Please try again.", { retryable: true });
        }
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok && data.success === true) return data;
        // The website's own messages ("That code is not right. 3 attempts left.") are written for users.
        const message = typeof data.error === "string" && data.error.length <= 200 ? data.error : null;
        if (response.status === 429) throw new AppError(429, "RATE_LIMITED", message ?? "Please wait a moment and try again.", { retryable: true });
        if (response.status === 404) throw new AppError(404, "NOT_FOUND", message ?? "This request has expired. Please fill in the form again.");
        if (response.status >= 400 && response.status < 500) throw new AppError(400, "VALIDATION_ERROR", message ?? "Please check your details.");
        throw new AppError(503, "SERVICE_UNAVAILABLE", "Requests can't be sent right now. Please try again.", { retryable: true });
    }
}

const LEAD_TTL_MS = 30 * 60_000;
const MAX_LEADS = 10_000;
/** New requests per client IP per window, on top of the website's own per-phone limit. */
const MAX_STARTS_PER_IP = 5;
const START_WINDOW_MS = 10 * 60_000;

interface PendingLead {
    requestId: string;
    phoneMasked: string;
    projectName?: string;
    verified: boolean;
    expiresAt: number;
}

const REQUEST_TYPE: Record<CreateLeadRequest["requestType"], string> = {
    callback: "general-callback",
    enquiry: "general-callback",
    site_visit: "site-visit",
    online_presentation: "online-presentation",
};

/**
 * Sends form details to the website and confirms them with the code sent to
 * the phone. Contact details are passed through, never stored or logged here;
 * only the website's request id and the masked number are kept, for 30 minutes
 * and in memory (with several API instances, verification must reach the one
 * that started the request).
 */
export class LeadService {
    private readonly leads = new Map<string, PendingLead>();
    private readonly starts = new Map<string, number[]>();

    constructor(
        private readonly gateway: LeadGateway | null,
        private readonly now: () => number = Date.now,
    ) {}

    get enabled(): boolean {
        return this.gateway !== null;
    }

    async create(input: CreateLeadRequest, clientIp: string): Promise<Lead> {
        const gateway = this.require();
        this.limit(clientIp);
        const appointment = input.requestType === "site_visit" || input.requestType === "online_presentation";
        const { requestId, phoneMasked } = await gateway.start(
            {
                name: input.name,
                phone: input.phone,
                email: input.email ?? "",
                message: input.message ?? "",
                requestType: REQUEST_TYPE[input.requestType],
                projectId: input.projectIds?.[0] ?? null,
                selectedProjects: appointment ? (input.projectIds ?? []) : [],
                ...(input.projectName ? { projectName: input.projectName } : {}),
                ...(appointment ? { visitDate: input.visitDate, visitTime: input.visitTime } : {}),
                ...(input.transportMode ? { transportMode: input.transportMode } : {}),
                ...(input.meetingPlatform ? { meetingPlatform: input.meetingPlatform } : {}),
                source: "chatbot",
                otpChannel: "whatsapp",
            },
            clientIp,
        );
        const leadId = randomUUID();
        this.prune();
        this.leads.set(leadId, { requestId, phoneMasked, projectName: input.projectName, verified: false, expiresAt: this.now() + LEAD_TTL_MS });
        return { leadId, phoneMasked, verified: false };
    }

    async resend(leadId: string, clientIp: string): Promise<Lead> {
        const lead = this.pending(leadId);
        const { phoneMasked } = await this.require().start({ requestId: lead.requestId, otpChannel: "whatsapp" }, clientIp);
        return { leadId, phoneMasked, verified: false };
    }

    async verify(leadId: string, otp: string): Promise<Lead> {
        const lead = this.pending(leadId);
        await this.require().verify(lead.requestId, otp, lead.projectName);
        lead.verified = true;
        return { leadId, phoneMasked: lead.phoneMasked, verified: true };
    }

    private require(): LeadGateway {
        if (!this.gateway) throw new AppError(503, "SERVICE_UNAVAILABLE", "Sending requests isn't available yet.");
        return this.gateway;
    }

    private pending(leadId: string): PendingLead {
        const lead = this.leads.get(leadId);
        if (!lead || lead.expiresAt < this.now()) {
            throw new AppError(404, "NOT_FOUND", "This request has expired. Please fill in the form again.");
        }
        if (lead.verified) throw new AppError(400, "VALIDATION_ERROR", "This request is already confirmed.");
        return lead;
    }

    private limit(clientIp: string) {
        const since = this.now() - START_WINDOW_MS;
        const recent = (this.starts.get(clientIp) ?? []).filter((t) => t > since);
        if (recent.length >= MAX_STARTS_PER_IP) {
            throw new AppError(429, "RATE_LIMITED", "Too many requests. Please try again in a few minutes.", { retryable: true });
        }
        this.starts.set(clientIp, [...recent, this.now()]);
    }

    private prune() {
        const now = this.now();
        for (const [id, lead] of this.leads) if (lead.expiresAt < now) this.leads.delete(id);
        while (this.leads.size >= MAX_LEADS) this.leads.delete(this.leads.keys().next().value!);
        if (this.starts.size > MAX_LEADS) this.starts.clear();
    }
}
