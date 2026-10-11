import { handleError } from '@/lib/errors/error-handler';

type RouteHandler = (req: Request, ...args: any[]) => Promise<Response> | Response;

/**
 * Wrap a route handler so any throw becomes the canonical error envelope.
 *
 * Delegates to `handleError` rather than building a response here. The previous
 * version returned `error.message` (and `error.status`) verbatim for *any*
 * throwable, which leaked internals such as Prisma messages to clients while
 * duplicating the mapping logic that already lived in `@/lib/errors`.
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ...args: any[]) => {
    try {
      return await handler(req, ...args);
    } catch (error: unknown) {
      return handleError(error);
    }
  };
}
