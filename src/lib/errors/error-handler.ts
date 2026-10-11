import { NextResponse } from 'next/server';
import { mapError } from './error-mapper';

/**
 * Central API error handler.
 *
 * Converts any thrown value into the project's canonical error envelope:
 *
 *   { success: false, error: string, code: string, details?: unknown }
 *
 * The raw throwable is logged server-side and never serialised, so a stack
 * trace, SQL fragment, connection string or other internal detail cannot leak
 * to a client. The previous implementation returned `error.message` verbatim in
 * non-production and echoed Prisma `meta`, both of which could expose internals.
 *
 * Status mapping (see `error-mapper.ts` for the full table):
 *   AppError            → its own `statusCode` / `code` / safe `message`
 *   ZodError            → 400 VALIDATION_ERROR with `details.fieldErrors`
 *   Prisma P2002/P2025/P2003 → 409 / 404 / 400 with safe copy
 *   anything else       → 500 INTERNAL_ERROR with a generic message
 */
export function handleApiError(error: unknown): NextResponse {
  return handleError(error);
}

export function handleError(error: unknown): NextResponse {
  const mapped = mapError(error);

  logError(mapped.cause, { code: mapped.body.code, status: mapped.status });

  return NextResponse.json(mapped.body, { status: mapped.status });
}

const REDACTED = '[redacted]';
const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|api[-_]?key|keyhash|signature|credential/i;
const MAX_LOG_DEPTH = 4;

/**
 * Deep-clone a value for logging with sensitive keys redacted.
 *
 * Bounded by `MAX_LOG_DEPTH` and cycle-safe so logging a pathological error
 * payload cannot throw or blow the stack — a logger that fails is worse than no
 * logger, because it hides the original failure.
 */
function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_LOG_DEPTH) return '[truncated]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(val, depth + 1, seen);
  }
  return result;
}

/**
 * Log a diagnostic for a failure. Never throws.
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;

  console.error('API error', {
    timestamp: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {}),
    error: redact(detail),
  });
}
