import { z } from "zod";

/**
 * PostgreSQL `text` and `jsonb` both reject U+0000, so every string that can
 * reach the database is validated against it up front.
 */
export const safeText = (max: number, min = 1) =>
    z
        .string()
        .min(min)
        .max(max)
        .refine((value) => !value.includes("\u0000"), {
            message: "Must not contain NUL characters",
        });

/** Calendar date in `YYYY-MM-DD` form (no time zone). */
export const IsoDateSchema = z.iso.date();

/** ISO-8601 timestamp with offset, as produced by `Date#toISOString()`. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const UuidSchema = z.uuid();
