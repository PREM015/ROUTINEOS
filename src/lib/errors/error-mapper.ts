import { ZodError } from 'zod';
import { AppError, type ErrorDetails } from './app-error';
import { ERROR_CODES, type ErrorCode } from './error-codes';

/**
 * The canonical, safe error body returned by every API route.
 *
 * `success: false` is always present so a client can branch on one field
 * regardless of which handler produced the response. `error` is a
 * human-readable, user-safe message; `code` is the stable machine code; and
 * `details` carries structured extras such as Zod field errors.
 */
export interface ErrorEnvelope {
  success: false;
  error: string;
  code: ErrorCode | string;
  details?: ErrorDetails | FieldErrorDetails;
}

export interface FieldErrorDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
}

/**
 * Result of mapping a throwable.
 *
 * `body` is the only thing that may be serialised into a response. `cause` is
 * the original throwable, kept separate (not spread into `body`) so a caller
 * cannot accidentally leak a stack trace or Prisma `meta` by serialising the
 * whole mapping result.
 */
export interface MappedError {
  status: number;
  body: ErrorEnvelope;
  cause: unknown;
}

/** Generic, non-leaking fallback message for unexpected server failures. */
const INTERNAL_MESSAGE =
  "We couldn't complete that request. Please try again in a moment.";

function envelope(
  code: ErrorCode | string,
  error: string,
  details?: ErrorDetails | FieldErrorDetails
): ErrorEnvelope {
  return {
    success: false,
    error,
    code,
    ...(details !== undefined && { details }),
  };
}

interface PrismaLikeError {
  name: string;
  code: string;
  meta?: unknown;
}

/**
 * Detect a Prisma request/initialization error structurally.
 *
 * Deliberately does not `instanceof` against `@/generated/prisma`: that import
 * pulls the Node client into any module that merely wants to map an error, and
 * it is unavailable in the pure test/runtime contexts this mapper runs in
 * (e.g. the Vitest `node` environment without a generated client). The shape is
 * stable and documented by Prisma.
 */
function asPrismaError(error: unknown): PrismaLikeError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { name?: unknown; code?: unknown };
  if (typeof candidate.code !== 'string') return null;
  if (
    candidate.name !== 'PrismaClientKnownRequestError' &&
    candidate.name !== 'PrismaClientInitializationError' &&
    candidate.name !== 'PrismaClientValidationError'
  ) {
    return null;
  }
  return candidate as PrismaLikeError;
}

/**
 * Map any thrown value to a safe HTTP status and envelope.
 *
 * Pure and dependency-light so it can be unit-tested without a database or a
 * running Next.js server. Never includes a raw `Error.message` for unexpected
 * failures, and never passes through Prisma `meta` (which can contain column
 * values and constraint names).
 */
export function mapError(error: unknown): MappedError {
  // 1. Typed application errors. Their messages are authored to be user-safe.
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: envelope(error.code, error.message, error.details),
      cause: error,
    };
  }

  // 2. Zod validation failures → 400 with flattened, per-field messages.
  if (error instanceof ZodError) {
    const { formErrors, fieldErrors } = error.flatten();
    const fields: Record<string, string[]> = {};
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0) fields[field] = [...messages];
    }
    const details: FieldErrorDetails = {};
    if (formErrors.length > 0) details.formErrors = [...formErrors];
    if (Object.keys(fields).length > 0) details.fieldErrors = fields;

    return {
      status: 400,
      body: envelope(
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        Object.keys(details).length > 0 ? details : undefined
      ),
      cause: error,
    };
  }

  // 3. Known Prisma failures. Map to safe messages; never echo `meta`.
  const prisma = asPrismaError(error);
  if (prisma) {
    switch (prisma.code) {
      case 'P2002':
        return {
          status: 409,
          body: envelope(
            ERROR_CODES.DUPLICATE_RECORD,
            'A record with these details already exists.'
          ),
          cause: error,
        };
      case 'P2025':
        return {
          status: 404,
          body: envelope(
            ERROR_CODES.NOT_FOUND,
            'This record may have been deleted or is no longer available. Refresh and try again.'
          ),
          cause: error,
        };
      case 'P2003':
        return {
          status: 400,
          body: envelope(
            ERROR_CODES.FOREIGN_KEY_ERROR,
            'A related record is missing, so this change could not be saved.'
          ),
          cause: error,
        };
      default:
        return {
          status: 500,
          body: envelope(ERROR_CODES.DATABASE_ERROR, INTERNAL_MESSAGE),
          cause: error,
        };
    }
  }

  // 4. Any other Error: never leak its message. Logged server-side by the caller.
  if (error instanceof Error) {
    return {
      status: 500,
      body: envelope(ERROR_CODES.INTERNAL_ERROR, INTERNAL_MESSAGE),
      cause: error,
    };
  }

  // 5. Non-Error throw (string, object, …).
  return {
    status: 500,
    body: envelope(ERROR_CODES.UNKNOWN_ERROR, INTERNAL_MESSAGE),
    cause: error,
  };
}
