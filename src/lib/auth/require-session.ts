import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { toUserId } from '@/types/ids';

/**
 * The two answers every guarded route needs, in one place.
 *
 * Previously each habit route open-coded this:
 *
 * ```ts
 * const session = await auth();
 * if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * ```
 *
 * which is correct but repeated in every handler, and — more importantly — gave
 * no way to express the second rule: some surfaces (the catalogue) are readable
 * by anyone signed in and writable only by an admin.
 */

export interface AuthenticatedSession {
  session: Session;
  userId: ReturnType<typeof toUserId>;
}

/**
 * Resolve the caller, or return the 401 response to send.
 *
 * `userId` comes from `session.user.id` and nothing else. There is deliberately
 * no parameter through which a route could pass a client-supplied id: the only
 * input is the signed session.
 *
 * Returning the response rather than throwing keeps the `if (!auth) return`
 * shape every existing handler already uses, so adopting this does not change
 * any route's control flow.
 */
export async function requireSession(): Promise<
  { ok: true; auth: AuthenticatedSession } | { ok: false; response: NextResponse }
> {
  const { auth } = await import('@/lib/auth');
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    auth: { session, userId: toUserId(session.user.id) },
  };
}

/**
 * Resolve the caller and require the ADMIN role.
 *
 * Returns 403, not 404: this is a permission failure on a shared, non-personal
 * resource, and there is no existence to leak. The contrast with habit routes
 * matters — those return 404 for another user's habit precisely *because* the
 * habit exists and its existence is private.
 *
 * 401 is returned for a missing session rather than 403, so "not signed in"
 * stays distinguishable from "signed in but not allowed".
 */
export async function requireAdmin(): Promise<
  { ok: true; auth: AuthenticatedSession } | { ok: false; response: NextResponse }
> {
  const result = await requireSession();
  if (!result.ok) return result;

  if (result.auth.session.user?.role !== 'ADMIN') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: admin role required' },
        { status: 403 }
      ),
    };
  }

  return result;
}
