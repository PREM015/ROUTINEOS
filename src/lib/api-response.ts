/**
 * Standardized API Response Helpers
 *
 * ## These return a `Response`, not a plain object
 *
 * Every helper here previously returned a bare object literal. Next 16 route
 * handlers must return an actual `Response` or `NextResponse`; returning an object
 * fails at runtime with
 *
 *   "No response is returned from route handler ... Expected a Response object
 *    but received 'Object'"
 *
 * which surfaced as a 500 on `GET /api/categories` and meant the block editor
 * could never load the category list.
 *
 * Returning a `Response` also means the *status code* is finally honoured.
 * `errorResponse(message, 401)` used to put `401` into the `details` field of a
 * 200 response, so every one of those calls was both the wrong type and the
 * wrong status.
 *
 * The `{ success, data }` / `{ success, error, details }` envelope is unchanged,
 * so `apiRequest` on the client and every existing call site keep working.
 */

import { NextResponse } from 'next/server';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
}

/** The envelope as a plain object, for callers that need to compose it. */
function successBody<T>(data: T, meta?: APIResponse['meta']): APIResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

function errorBody(error: string, details?: any): APIResponse {
  return {
    success: false,
    error,
    ...(details !== undefined && { details }),
  };
}

/**
 * 200 with the data envelope.
 *
 * Use `createdResponse` when the write created something and the status matters.
 */
export function successResponse<T>(data: T, meta?: APIResponse['meta']): NextResponse {
  return NextResponse.json(successBody(data, meta));
}

/** 201, for a create. */
export function createdResponse<T>(data: T, meta?: APIResponse['meta']): NextResponse {
  return NextResponse.json(successBody(data, meta), { status: 201 });
}

export function apiSuccess<T>(data: T, meta?: APIResponse['meta']): NextResponse {
  return NextResponse.json(successBody(data, meta));
}

/**
 * An error with a real status code.
 *
 * @param error   Human-readable message.
 * @param status  HTTP status. Defaults to 500. This is the second argument at
 *                every call site in the repo, which is what those calls always
 *                intended.
 * @param details Optional structured detail, e.g. Zod's `flatten()`.
 */
export function errorResponse(
  error: string,
  status = 500,
  details?: unknown
): NextResponse {
  return NextResponse.json(errorBody(error, details), { status });
}

/** 400 with a Zod `flatten()` payload attached. */
export function validationErrorResponse(errors: any): NextResponse {
  return NextResponse.json(errorBody('Validation failed', errors), { status: 400 });
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(errorBody('Unauthorized'), { status: 401 });
}

export function forbiddenResponse(): NextResponse {
  return NextResponse.json(errorBody('Forbidden'), { status: 403 });
}

export function notFoundResponse(resource: string = 'Resource'): NextResponse {
  return NextResponse.json(errorBody(`${resource} not found`), { status: 404 });
}
