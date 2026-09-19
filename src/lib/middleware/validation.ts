import type { NextRequest } from 'next/server';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { ValidationError } from '@/lib/errors/app-error';

/**
 * Validation middleware for API routes.
 * Body parsing plus Zod-based request validation.
 */

/**
 * Validate an unknown payload against a Zod schema. Throws `ValidationError`
 * with flattened field errors on failure.
 */
export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      'Validation failed',
      (result.error as ZodError).flatten()
    );
  }
  return result.data;
}

/**
 * Parse a NextRequest JSON body as `unknown`, throwing a `ValidationError` on
 * malformed JSON.
 */
export async function parseJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

/**
 * Wrap a handler with body validation. The parsed and validated payload is
 * passed as the second argument.
 * @example
 * export const POST = withValidation(
 *   async (req, data) => NextResponse.json(successResponse(data)),
 *   createGoalSchema
 * );
 */
export function withValidation<T>(
  handler: (req: NextRequest, data: T, params?: unknown) => Promise<Response> | Response,
  schema: ZodSchema<T>
) {
  return async (req: NextRequest, context?: { params?: unknown }) => {
    const body = await parseJsonBody(req);
    const data = validateBody(schema, body);
    return handler(req, data, context?.params);
  };
}

/**
 * Validate only when the request carries a body (e.g. `PATCH` updates).
 */
export function withOptionalValidation<T>(
  handler: (req: NextRequest, data: T | null, params?: unknown) => Promise<Response> | Response,
  schema: ZodSchema<T>
) {
  return async (req: NextRequest, context?: { params?: unknown }) => {
    const body = await parseJsonBody(req);
    const data = Object.keys(body as Record<string, unknown>).length === 0
      ? null
      : validateBody(schema, body);
    return handler(req, data, context?.params);
  };
}