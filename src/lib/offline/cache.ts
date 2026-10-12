import { STORE_CACHE, STORE_OUTBOX, STORE_SCHEDULE, idbClear, idbDelete, idbGet, idbGetAll, idbPut } from '@/lib/offline/idb';

/**
 * Per-user read cache so the app can render a schedule and schedule reminders
 * while offline.
 *
 * The server is authoritative; this is a copy. It is deliberately small and
 * typed loosely at the boundary — the shapes come from API responses
 * (`ResolvedDailyRoutine`, `UserSettings`), and importing those *types* is safe
 * (types are erased) while importing the server modules that define them is not
 * (they drag Prisma into the client bundle).
 *
 * ## Scoping
 *
 * Every key is prefixed with the owning `userId`, so a shared device that signs
 * into a second account cannot read the first account's cached schedule. Keys
 * are also prefixed by kind (`day:`, `settings:`) so the store stays inspectable.
 */

export type CacheKind = 'day' | 'settings';

const KIND_PREFIX: Record<CacheKind, string> = {
  day: 'day',
  settings: 'settings',
};

interface CacheRow<T = unknown> {
  id: string;
  userId: string;
  kind: CacheKind;
  key: string;
  data: T;
  cachedAt: number;
}

function rowId(userId: string, kind: CacheKind, key: string): string {
  return `${userId}:${KIND_PREFIX[kind]}:${key}`;
}

export async function cachePut<T>(
  userId: string,
  kind: CacheKind,
  key: string,
  data: T
): Promise<boolean> {
  if (!userId) return false;
  const row: CacheRow<T> = {
    id: rowId(userId, kind, key),
    userId,
    kind,
    key,
    data,
    cachedAt: Date.now(),
  };
  try {
    await idbPut(STORE_CACHE, row);
    return true;
  } catch {
    return false;
  }
}

export async function cacheGet<T>(
  userId: string,
  kind: CacheKind,
  key: string
): Promise<T | null> {
  if (!userId) return null;
  try {
    const row = await idbGet<CacheRow<T>>(STORE_CACHE, rowId(userId, kind, key));
    return row ? row.data : null;
  } catch {
    return null;
  }
}

/** All cached rows of one kind for one user, newest write first. */
export async function cacheList<T>(userId: string, kind: CacheKind): Promise<Array<{ key: string; data: T; cachedAt: number }>> {
  if (!userId) return [];
  try {
    const rows = await idbGetAll<CacheRow<T>>(STORE_CACHE);
    return rows
      .filter((row) => row && row.userId === userId && row.kind === kind)
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .map((row) => ({ key: row.key, data: row.data, cachedAt: row.cachedAt }));
  } catch {
    return [];
  }
}

export async function cacheDelete(userId: string, kind: CacheKind, key: string): Promise<void> {
  try {
    await idbDelete(STORE_CACHE, rowId(userId, kind, key));
  } catch {
    // Best effort.
  }
}

/**
 * Drop one user's cached rows, leaving other accounts on the device intact.
 *
 * Used on sign-out. The outbox and schedule stores are cleared wholesale by
 * {@link clearAllOffline} instead, because they are not keyed by user.
 */
export async function clearUserCache(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const rows = await idbGetAll<CacheRow>(STORE_CACHE);
    await Promise.all(
      rows.filter((row) => row && row.userId === userId).map((row) => idbDelete(STORE_CACHE, row.id))
    );
  } catch {
    // Best effort.
  }
}

/**
 * Purge every offline store. Called on sign-out so the next account never
 * inherits the previous user's cached schedule or queue.
 */
export async function clearAllOffline(): Promise<void> {
  await Promise.all(
    [STORE_OUTBOX, STORE_SCHEDULE, STORE_CACHE].map((store) => idbClear(store).catch(() => undefined))
  );
}
