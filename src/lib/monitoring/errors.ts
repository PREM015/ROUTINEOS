/**
 * Error normalization, classification and formatting.
 *
 * Bridge between low-level thrown values and the app's `AppError` hierarchy
 * (`@/lib/errors/app-error`). `normalizeError` guarantees a well-formed,
 * serializable error object regardless of what was thrown; `classifyError`
 * produces a stable category + HTTP status used by API/error boundaries.
 */

import { AppError } from '@/lib/errors/app-error';

export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'not-found'
  | 'conflict'
  | 'rate-limit'
  | 'external'
  | 'database'
  | 'unknown';

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  /** Original thrown value when it is not an `Error`. */
  raw?: unknown;
  /** App-code error code, when thrown by an `AppError`. */
  code?: string;
}

/** HTTP status suggested for each error category. */
export const CATEGORY_STATUS: Record<ErrorCategory, number> = {
  validation: 400,
  auth: 401,
  'not-found': 404,
  conflict: 409,
  'rate-limit': 429,
  external: 502,
  database: 503,
  unknown: 500,
};

/**
 * Turn any thrown value into a plain, serializable error record.
 */
export function normalizeError(exception: unknown): NormalizedError {
  if (exception instanceof Error) {
    const normalized: NormalizedError = {
      name: exception.name,
      message: exception.message,
      stack: exception.stack,
      cause: exception.cause,
    };
    if (exception instanceof AppError) {
      normalized.code = exception.code;
      if (exception.details !== undefined) {
        normalized.raw = exception.details;
      }
    }
    return normalized;
  }
  if (typeof exception === 'string') {
    return { name: 'Error', message: exception, raw: exception };
  }
  return {
    name: 'UnknownError',
    message: 'An unknown error occurred.',
    raw: exception,
  };
}

/**
 * Classify a thrown value into a stable category + suggested HTTP status.
 */
export function classifyError(
  exception: unknown
): { category: ErrorCategory; status: number; message: string } {
  const normalized = normalizeError(exception);
  const text = `${normalized.name} ${normalized.message}`.toLowerCase();

  let category: ErrorCategory = 'unknown';
  if (normalized.code === 'VALIDATION_ERROR' || /validation|invalid|zod/i.test(text)) {
    category = 'validation';
  } else if (
    normalized.code === 'UNAUTHORIZED' ||
    normalized.code === 'FORBIDDEN' ||
    /unauthorized|forbidden|not\s+authenticated|401/i.test(text)
  ) {
    category = 'auth';
  } else if (
    normalized.code === 'NOT_FOUND' ||
    /not\s+found|no\s+record|404/i.test(text)
  ) {
    category = 'not-found';
  } else if (normalized.code === 'CONFLICT' || /already\s+exists|duplicate/i.test(text)) {
    category = 'conflict';
  } else if (normalized.code === 'RATE_LIMITED' || /rate\s+limit|too\s+many/i.test(text)) {
    category = 'rate-limit';
  } else if (/prisma|postgres|sql|database|connection\s+refused/i.test(text)) {
    category = 'database';
  } else if (/fetch|http|network|timeout|resend|stripe/i.test(text)) {
    category = 'external';
  }

  return {
    category,
    status: CATEGORY_STATUS[category],
    message: normalized.message,
  };
}

/** Human-readable, middleware-friendly error format. */
export function formatError(exception: unknown): {
  error: string;
  status: number;
  details?: NormalizedError;
  category: ErrorCategory;
} {
  const classification = classifyError(exception);
  const normalized = normalizeError(exception);
  const output: {
    error: string;
    status: number;
    details?: NormalizedError;
    category: ErrorCategory;
  } = {
    error: classification.message,
    status: classification.status,
    category: classification.category,
  };
  if (normalized.code || normalized.raw !== undefined) {
    output.details = normalized;
  }
  return output;
}

/** Map a status code back onto a category (HTTP boundaries). */
export function categoryForStatus(status: number): ErrorCategory {
  if (status >= 500) return 'database';
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'auth';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limit';
  if (status >= 400) return 'validation';
  return 'unknown';
}