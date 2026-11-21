import { AppError } from "./errors.js";

/**
 * Opaque pagination cursor wrapping a message `seq`. Clients must treat it as
 * an opaque string; the encoding may change.
 */
export function encodeCursor(seq: string): string {
    return Buffer.from(JSON.stringify({ v: 1, seq }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): string {
    try {
        const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { v?: unknown }).v === 1 &&
            typeof (parsed as { seq?: unknown }).seq === "string" &&
            /^[1-9]\d{0,18}$/.test((parsed as { seq: string }).seq)
        ) {
            return (parsed as { seq: string }).seq;
        }
    } catch {
        // fall through
    }
    throw new AppError(400, "INVALID_CURSOR", "The `before` cursor is invalid");
}
