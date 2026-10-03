import { UserRepository } from '@/server/repositories/user.repository';
import { AuthorizationError } from '@/lib/errors/app-error';

/**
 * Shared administrator gate.
 *
 * The `if (user?.role !== 'ADMIN') return 403` check was written inline in every
 * handler of every `/api/admin/*` route. It was already duplicated five times
 * before this was extracted, and it is the kind of check that must not be
 * duplicated: a handler that simply forgets it is a privilege escalation, and
 * nothing in the type system notices.
 *
 * It lives in `src/server/` rather than in a service because it guards
 * *several* domains (feature flags, feedback, users) rather than owning one.
 *
 * `AuthorizationError` maps to 403, deliberately distinct from a 401: the caller
 * is authenticated, they simply may not perform this operation.
 */
export async function assertAdmin(userId: string): Promise<void> {
  const user = await new UserRepository().findById(userId);
  if (user?.role !== 'ADMIN') {
    throw new AuthorizationError('Forbidden');
  }
}

/**
 * Assert the caller owns the resource at `resourceUserId`.
 *
 * Owner-only, with **no** admin bypass. That is the rule for anything personal
 * and self-scoped: a user's own settings row, their own device registrations,
 * their own activity feed. It is deliberately stricter than `assertAdmin` — an
 * administrator can reach these through the dedicated `/api/admin/*` routes,
 * where every access is audited, and not by presenting another user's id here.
 *
 * The comparison was inlined in six route handlers, which is a lot of places for
 * a check whose failure is someone reading someone else's data.
 */
export function assertSelf(callerId: string, resourceUserId: string): void {
  if (callerId !== resourceUserId) {
    throw new AuthorizationError('Forbidden');
  }
}
