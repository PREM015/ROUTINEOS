import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { ZodSchema } from 'zod';
import { handleApiError } from '@/lib/errors/error-handler';
import { apiSuccess } from '@/lib/api-response';
import { AuthError } from '@/lib/errors/app-error';

type ApiHandlerOptions = {
  requireAuth?: boolean;
  requireAdmin?: boolean;
  validateBody?: ZodSchema;
};

type ApiHandlerFunction<T = any> = (
  req: NextRequest,
  context: {
    session: any;
    body?: any;
    params?: any;
  }
) => Promise<T>;

/**
 * Universal API route handler with built-in:
 * - Authentication
 * - Validation
 * - Error handling
 * - Response wrapping
 */
export function createApiHandler<T = any>(
  handler: ApiHandlerFunction<T>,
  options: ApiHandlerOptions = {}
) {
  return async (req: NextRequest, { params }: { params?: any } = {}) => {
    try {
      // Authentication
      const session = options.requireAuth || options.requireAdmin 
        ? await auth()
        : null;

      if (options.requireAuth && !session?.user?.id) {
        throw new AuthError('You must be logged in to access this resource');
      }

      if (options.requireAdmin && session?.user?.role !== 'ADMIN') {
        throw new AuthError('Admin access required');
      }

      // Body validation
      let body;
      if (options.validateBody && ['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
        const json = await req.json();
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
export function createAuthHandler<T = any>(handler: ApiHandlerFunction<T>, validateBody?: ZodSchema) {
  return createApiHandler(handler, { requireAuth: true, validateBody });
}

/**
 * Shorthand for admin-only routes
 */
export function createAdminHandler<T = any>(handler: ApiHandlerFunction<T>, validateBody?: ZodSchema) {
  return createApiHandler(handler, { requireAdmin: true, validateBody });
}