'use client';

import { STORE_OUTBOX, idbGetAll, idbPut, idbDelete } from '@/lib/offline/idb';

/**
 * A durable outbox for focus lifecycle transitions.
 *
 * ## Why this exists at all
 *
 * `FocusRuntime` already queues a failed transition and replays it on `online`. That
 * queue lived in a `useRef`, so it survived a network blip but not a reload - and a
 * reload is exactly what happens when someone closes a laptop mid-session. The old
 * code documented that as an acceptable trade ("the cost of dropping the queue on
 * reload is one lost retry"), which is true for a retry and not true for a *session
 * end*: losing `end` leaves a row the server still reads as running, which is the
 * stale-row problem `decideRecovery` exists to clean up.
 *
 * ## Why the server stays authoritative anyway
 *
 * Replaying a transition is best-effort, never a substitute for the server's own
 * reconciliation. A queued `pause` that arrives after the user already resumed is
 * worse than never sending it, so `drain` is ordered oldest-first and each item is
 * allowed to fail independently.
 *
 * ## Idempotency
 *
 * Each item carries a `localId` used as the IndexedDB key, and the Start transition
 * carries a `clientId` the server already de-duplicates on
 * (`FocusService.startSession` returns the existing row for a known `clientId`). So a
 * replay of Start is safe. For the other transitions the server is state-transition
 * guarded - a pause on an ended session is a no-op or a 404, never a double-write -
 * so re-sending is safe there too. That is what makes replaying without server-side
 * change-once semantics acceptable.
 */

/**
 * Deliberately excludes `heartbeat`.
 *
 * A heartbeat is a periodic liveness ping whose whole purpose is to stop mattering -
 * replaying a stale one tells the server nothing true. Only transitions that change
 * state are worth surviving a reload.
 */
export type OutboxKind = 'pause' | 'resume' | 'end';

export interface OutboxItem {
  /** IndexedDB key. Also the per-device ordering token. */
  localId?: number;
  /** The session this applies to. */
  sessionId: string;
  kind: OutboxKind;
  endReason?: string;
  /** ISO timestamp, for diagnostics and for dropping items that are too old to matter. */
  queuedAt: string;
  /** How many times this has been attempted, so a permanently-failing item can be given up on. */
  attempts: number;
}

/** Below this, IndexedDB is unavailable (private mode, SSR) and the caller falls back to memory. */
function idbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/**
 * An item older than this is dropped rather than replayed.
 *
 * A pause from three days ago replayed on reconnect would pause a session that has
 * since been closed, or be a no-op at best. Focus is a real-time activity; a
 * three-day-old transition is noise, not work.
 */
export const OUTBOX_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export async function enqueue(item: Omit<OutboxItem, 'localId' | 'queuedAt' | 'attempts'>): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await idbPut(STORE_OUTBOX, {
      ...item,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    } satisfies OutboxItem);
  } catch {
    // Storage full or blocked. The in-memory queue in `FocusRuntime` still holds the
    // transition for this page's lifetime, so this is a degradation, not a loss.
  }
}

/** Everything queued, oldest first. Stale items are deleted as they are returned. */
export async function loadOutbox(): Promise<OutboxItem[]> {
  if (!idbAvailable()) return [];
  try {
    const rows = await idbGetAll<OutboxItem>(STORE_OUTBOX);
    const cutoff = Date.now() - OUTBOX_MAX_AGE_MS;
    const live: OutboxItem[] = [];

    for (const row of rows) {
      const queuedAt = Date.parse(row.queuedAt);
      if (!Number.isFinite(queuedAt) || queuedAt < cutoff) {
        if (typeof row.localId === 'number') await idbDelete(STORE_OUTBOX, row.localId);
        continue;
      }
      live.push(row);
    }

    // `queuedAt` rather than `localId` for ordering: auto-increment keys are assigned
    // per store and two devices writing the same store can interleave, whereas the
    // timestamp is the thing whose order we actually mean.
    return live.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}

export async function removeFromOutbox(localId: number): Promise<void> {
  if (!idbAvailable() || typeof localId !== 'number') return;
  try {
    await idbDelete(STORE_OUTBOX, localId);
  } catch {
    // Nothing useful to do; the item will be re-read and retried on the next drain.
  }
}

/** Drop everything. Used on sign-out so the next account never inherits a queue. */
export async function clearOutbox(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const { idbClear } = await import('@/lib/offline/idb');
    await idbClear(STORE_OUTBOX);
  } catch {
    // Best effort.
  }
}