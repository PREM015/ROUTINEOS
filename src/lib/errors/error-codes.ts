/**
 * Stable, machine-readable error codes.
 *
 * These are part of the API contract: a client may branch on `code` without
 * parsing the human-readable `error` message (which may be reworded). Keep the
 * string values stable once shipped.
 *
 * `code` is intentionally a `string` on the wire rather than a closed union so
 * an error thrown by a future service does not have to be registered here to be
 * serialisable — but every code emitted by this codebase should come from this
 * table.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',

  // Codes emitted by `AppError` subclasses and by route-level handlers that
  // predate the table above. Kept verbatim so existing clients do not break.
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  FOREIGN_KEY_ERROR: 'FOREIGN_KEY_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * The default error code for an HTTP status, used when a caller only has a
 * status (e.g. `errorResponse(message, 401)` in a route) and no typed error.
 */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ERROR_CODES.VALIDATION_ERROR;
    case 401:
      return ERROR_CODES.UNAUTHORIZED;
    case 403:
      return ERROR_CODES.FORBIDDEN;
    case 404:
      return ERROR_CODES.NOT_FOUND;
    case 409:
      return ERROR_CODES.CONFLICT;
    case 429:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.UNKNOWN_ERROR;
  }
}
