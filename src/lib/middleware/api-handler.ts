import { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { ZodSchema } from 'zod';
import { handleApiError } from '@/lib/errors/error-handler';
import { apiSuccess } from '@/lib/api-response';
import { AuthError } from '@/lib/errors/app-error';

type ApiHandlerOptions<Body> = {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  validateBody?: ZodSchema<Body>;
};

/** Next.js App Router dynamic-route params (`{ id: string }` and friends). */
export type RouteParams = Record<string, string | string[] | undefined>;

/** `auth()` returns null when the caller is anonymous. */
type AuthenticatedSession = Session | null;

type ApiHandlerContext<Body> = {
  session: AuthenticatedSession;
  body: Body;
  params: RouteParams | undefined;
};

type ApiHandlerFunction<T, Body> = (
  req: NextRequest,
  context: ApiHandlerContext<Body>
) => Promise<T>;

/**
 * Universal API route handler with built-in:
 * - Authentication
 * - Validation
 * - Error handling
 * - Response wrapping
 */
export function createApiHandler<T, Body = void>(
  handler: ApiHandlerFunction<T, Body>,
  options: ApiHandlerOptions<Body> = {}
) {
  return async (req: NextRequest, { params }: { params?: RouteParams | Promise<RouteParams> } = {}) => {
    try {
      // Authentication
      const session: AuthenticatedSession =
        options.requireAuth || options.requireAdmin ? await auth() : null;

      if (options.requireAuth && !session?.user?.id) {
        throw new AuthError('You must be logged in to access this resource');
      }

      if (options.requireAdmin && session?.user?.role !== 'ADMIN') {
        throw new AuthError('Admin access required');
      }

      // Body validation. Without a schema there is nothing to parse, so the
      // body stays undefined rather than reading an unread stream.
      let body: Body = undefined as Body;
      if (options.validateBody && ['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
        const json: unknown = await req.json();
        body = options.validateBody.parse(json);
      }

      // Execute handler
      const resolvedParams = params ? await params : undefined;
      const result = await handler(req, { session, body, params: resolvedParams });

      // Wrap success response
      return apiSuccess(result);
    } catch (error) {
      // Centralized error handling
      return handleApiError(error);
    }
  };
}

/**
 * Shorthand for authenticated routes
 */
export function createAuthHandler<T, Body = void>(
  handler: ApiHandlerFunction<T, Body>,
  validateBody?: ZodSchema<Body>
) {
  return createApiHandler(handler, { requireAuth: true, validateBody });
}

/**
 * Shorthand for admin-only routes
 */
export function createAdminHandler<T, Body = void>(
  handler: ApiHandlerFunction<T, Body>,
  validateBody?: ZodSchema<Body>
) {
  return createApiHandler(handler, { requireAdmin: true, validateBody });
}