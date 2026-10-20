import { apiRequest } from '@/lib/api-client';

/**
 * One unread-count source for the whole app.
 *
 * The navbar bell and the `/notifications` page used to each keep their own
 * number: the bell polled `?limit=1` every 60 seconds while the page held its
 * own `useState`, so after "Mark all as read" the list showed nothing unread and
 * the badge still said 23 until the next tick. Two components rendering the same
 * fact from two caches is a disagreement waiting to happen.
 *
 * The store is a plain module singleton read through `useSyncExternalStore`, so
 * every subscriber re-renders from the same value the moment it changes. It is
 * deliberately not a React context: the bell lives in the layout header and the
 * history page lives under a different subtree, and a context would have to be
 * installed above both for no benefit.
 *
 * Nothing here runs on the server. The server snapshot returns 0, which matches
 * the client's initial value, so hydration never mismatches; the real count
 * arrives in the effect that runs immediately after.
 */

let unread = 0;
/**
 * Bumped by every local write, so an in-flight poll can tell whether the world
 * moved underneath it.
 *
 * Without this, opening `/notifications` marks everything read while the bell's
 * own `refreshUnread()` is still in the air; that request resolves *after* the
 * clear with a count it read *before* it, and the badge jumps back to 23 until
 * the next poll. A response that started before the latest local write is by
 * definition stale and is dropped.
 */
let generation = 0;
const listeners = new Set<() => void>();

/** Snapshot for `useSyncExternalStore`. A primitive, so identity is stable. */
export function getUnreadSnapshot(): number {
  return unread;
}

/**
 * Server snapshot for `useSyncExternalStore`.
 *
 * Always 0 rather than a `useState` initialiser: there is no server-side unread
 * count to read here, and returning the same value the client starts with is
 * what keeps the badge from flickering between renders.
 */
export function getServerUnreadSnapshot(): number {
  return 0;
}

export function subscribeUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publish a new count.
 *
 * Values are normalised rather than trusted: `undefined`, `NaN` and negatives
 * all become 0, because a badge rendering "NaN" is worse than a badge showing
 * nothing at all.
 */
export function setUnread(next: number): void {
  const clamped = Number.isFinite(next) && next > 0 ? Math.trunc(next) : 0;
  generation += 1;
  if (clamped === unread) return;
  unread = clamped;
  for (const listener of listeners) listener();
}

/**
 * Move the count by a delta rather than replacing it.
 *
 * A component that only knows *one row changed* — a dismiss, an answer — cannot
 * compute the new total without holding the old one, and two of them holding the
 * old one is exactly the disagreement this store exists to prevent.
 */
export function bumpUnread(by: number): void {
  if (!Number.isFinite(by) || by === 0) return;
  setUnread(unread + by);
}

/**
 * Re-read the count from the server and publish it.
 *
 * Never rejects: the badge is decoration, and a failed fetch must not surface
 * an unhandled rejection into whatever navigation triggered it.
 */
export async function refreshUnread(): Promise<number> {
  const startedAt = generation;
  try {
    const data = await apiRequest<{ unreadCount?: number }>('/api/notifications?limit=1');
    // Someone wrote a better answer while this request was in flight.
    if (startedAt !== generation) return unread;
    setUnread(data.unreadCount ?? 0);
  } catch {
    // Stale badge beats a broken header.
  }
  return unread;
}
