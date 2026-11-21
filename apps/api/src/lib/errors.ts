import type { ApiErrorBody, ErrorCode } from "@property-assistant/contracts";
import type { z } from "zod";

export interface AppErrorOptions {
    retryable?: boolean;
    details?: unknown;
    headers?: Record<string, string>;
    cause?: unknown;
}

/** An error with a stable API code, safe to show to clients. */
export class AppError extends Error {
    readonly retryable: boolean;
    readonly details: unknown;
    readonly headers: Record<string, string>;

    constructor(
        readonly statusCode: number,
        readonly code: ErrorCode,
        message: string,
        options: AppErrorOptions = {},
    ) {
        super(message, { cause: options.cause });
        this.name = "AppError";
        this.retryable = options.retryable ?? false;
        this.details = options.details;
        this.headers = options.headers ?? {};
    }

    toBody(requestId?: string): ApiErrorBody {
        return {
            code: this.code,
            message: this.message,
            retryable: this.retryable,
            ...(requestId ? { requestId } : {}),
            ...(this.details !== undefined ? { details: this.details } : {}),
        };
    }
}

export function zodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
    return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/** Parses request input, converting validation failures into a 400. */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown, location: string): z.output<S> {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new AppError(400, "VALIDATION_ERROR", `Invalid request ${location}`, {
            details: zodIssues(result.error),
        });
    }
    return result.data;
}

export const conversationNotFound = () =>
    new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
