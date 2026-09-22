import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { AuthenticationError, AuthorizationError } from '@/lib/errors/app-error';

/**
 * Auth middleware for API routes.
 * Wraps Next.js route handlers with session enforcement.
 */

export type AuthSession = Session;

type AuthenticatedHandler = (
  req: NextRequest,
  session: AuthSession,
  params?: unknown
) => Promise<Response> | Response;

export interface AuthOptions {
  requireAdmin?: boolean;
}

/**
 * Fetch the current session, or throw when the user is not signed in.
 */
export async function getRequiredSession(): Promise<AuthSession> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthenticationError();
  }
  return session;
}

/**
 * Whether a session belongs to an admin user.
 */
export function isAdmin(session: AuthSession | null): boolean {
  return session?.user?.role === 'ADMIN';
}

/**
 * Wrap an authenticated handler, resolving the session before execution.
 * Admin-gated routes require `role === 'ADMIN'`.
 * @example
 * export const POST = withAuth(async (req, session) => {
 *   return NextResponse.json(successResponse({ userId: session.user.id }));
 * });
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options: AuthOptions = {}
) {
  return async (req: NextRequest, context?: { params?: unknown }) => {
    const session = await getRequiredSession();
    if (options.requireAdmin && !isAdmin(session)) {
      throw new AuthorizationError('Admin access required');
    }
    return handler(req, session, context?.params);
  };
}