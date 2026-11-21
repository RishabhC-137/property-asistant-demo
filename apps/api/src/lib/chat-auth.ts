import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

const ISSUER = "catalog";
const AUDIENCE = "property-assistant";

export interface ChatPrincipal {
    /** Stable Property Desk user id. Never trust an id supplied by the browser. */
    subject: string;
}

function decodeBase64Url(value: string): Buffer | null {
    try {
        return Buffer.from(value, "base64url");
    } catch {
        return null;
    }
}

/** Verifies the narrow, short-lived HS256 ticket minted by Property Desk. */
export function verifyChatTicket(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): ChatPrincipal | null {
    const [headerPart, payloadPart, signaturePart, extra] = token.split(".");
    if (!headerPart || !payloadPart || !signaturePart || extra) return null;
    const header = decodeBase64Url(headerPart);
    const payload = decodeBase64Url(payloadPart);
    const supplied = decodeBase64Url(signaturePart);
    if (!header || !payload || !supplied) return null;

    const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    try {
        const parsedHeader = JSON.parse(header.toString("utf8")) as { alg?: unknown; typ?: unknown };
        const claims = JSON.parse(payload.toString("utf8")) as { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown; scope?: unknown };
        if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
        if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.scope !== "chat_identity") return null;
        if (typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 128) return null;
        if (typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds) return null;
        return { subject: claims.sub };
    } catch {
        return null;
    }
}

/** Missing credentials remain anonymous; malformed credentials are rejected, never ignored. */
export function chatPrincipal(request: FastifyRequest, secret: string): ChatPrincipal | null {
    const authorization = request.headers.authorization;
    if (!authorization) return null;
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
    if (!match) throw new AppError(401, "UNAUTHORIZED", "Invalid chat authentication", { headers: { "WWW-Authenticate": "Bearer" } });
    if (!secret) throw new AppError(503, "SERVICE_UNAVAILABLE", "Signed chat authentication is not configured", { retryable: false });
    const principal = verifyChatTicket(match[1]!, secret);
    if (!principal) throw new AppError(401, "UNAUTHORIZED", "Chat authentication has expired or is invalid", { headers: { "WWW-Authenticate": "Bearer" } });
    return principal;
}
