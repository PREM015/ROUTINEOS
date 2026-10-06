'use client';

/**
 * Device-local preferences for `/analytics`, scoped per user.
 *
 * ## Why the user id is in the key
 *
 * The focus store hit this exact problem: keys were global, so on a shared browser the
 * next person to sign in inherited the previous person's running timer. The same failure
 * here would hand a stranger someone's habit targets and their room layout. Every key is
 * therefore `routineos:analytics:<scope>:<userId>`, matching `focusStorageKey`'s existing
 * convention rather than inventing a second one.
 *
 * `anonymous` is a real fallback, not a placeholder: `/analytics` is authenticated, but
 * the session can be briefly absent while it loads, and writing under `anonymous` then
 * reading back under a real id would silently discard the preference. Isolating it is the
 * lesser bug, and it is what the focus store already does.
 *
 * ## Why every access is wrapped
 *
 * `localStorage` throws rather than returning null in several real situations: Safari
 * private browsing, a full quota, and any browser with site data blocked. A page that
 * calls `localStorage.getItem` unguarded does not degrade — it crashes, taking the whole
 * report with it because a *preference* was unreadable. So reads return a default and
 * writes return a boolean, and no caller has to care.
 *
 * ## What belongs here and what does not
 *
 * Device-local only: layout, targets, muted categories, view density. Anything that must
 * survive a new device, or that another surface has to agree with, is server state and
 * does not belong in this module.
 */

const NAMESPACE = 'routineos:analytics';

/** Bumped when a stored shape changes incompatibly, so old data is ignored not misread. */
const VERSION = 'v1';

export type AnalyticsStorageScope =
  | 'layout'
  | 'targets'
  | 'muted-categories'
  | 'view-density';

/**
 * Build the per-user key for a scope.
 *
 * Exported so a test can assert the user id is actually in it, rather than trusting that
 * a string template somewhere did the right thing.
 */
export function analyticsStorageKey(
  scope: AnalyticsStorageScope,
  userId: string | undefined
): string {
  return `${NAMESPACE}:${VERSION}:${scope}:${userId ?? 'anonymous'}`;
}

/**
 * `localStorage`, or `null` where it is unavailable or blocked.
 *
 * Resolved per call rather than cached in a module constant: a browser can start
 * permitting storage after the first denial, and a cached `null` would keep denying for
 * the life of the tab.
 */
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // Accessing the property itself throws when site data is blocked.
    return null;
  }
}

/**
 * Read and parse a stored preference.
 *
 * Returns `fallback` for a missing key, a parse failure, or unavailable storage. A
 * corrupt value is treated exactly like an absent one rather than throwing, because a
 * hand-edited or half-written entry must not break the page.
 */
export function readStored<T>(
  scope: AnalyticsStorageScope,
  userId: string | undefined,
  fallback: T,
  validate?: (value: unknown) => value is T
): T {
  const store = storage();
  if (!store) return fallback;

  try {
    const raw = store.getItem(analyticsStorageKey(scope, userId));
    if (raw === null) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write a preference.
 *
 * Returns whether it persisted. A `false` is not an error the UI must surface — the
 * feature still works for this session — but callers that need to *promise* persistence
 * (a saved view the user expects to keep) can check.
 */
export function writeStored(
  scope: AnalyticsStorageScope,
  userId: string | undefined,
  value: unknown
): boolean {
  const store = storage();
  if (!store) return false;

  try {
    store.setItem(analyticsStorageKey(scope, userId), JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded, or storage disabled mid-session.
    return false;
  }
}

/** Remove one scope. Used by the layout reset control. */
export function clearStored(
  scope: AnalyticsStorageScope,
  userId: string | undefined
): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(analyticsStorageKey(scope, userId));
  } catch {
    // Nothing useful to do; the preference simply stays.
  }
}
