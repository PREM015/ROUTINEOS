/**
 * Achievement zustand store — a small queue of newly-unlocked achievements
 * surfaced as celebration toasts.
 *
 * `runAchievementCheck()` is the client-side trigger: it fire-and-forgets a
 * POST to /api/achievements/unlock after a meaningful write action (habit
 * completion, focus session finish, goal complete) and pushes any newly
 * unlocked events into the store. The celebration host (<CelebrationHost/>)
 * watches the queue and renders the next event through AchievementPopup.
 *
 * The check is best-effort — callers never await it and failures are silent,
 * so unlock evaluation can never block or break the primary action.
 */

'use client';

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import {
  dequeueCelebration,
  enqueueCelebrations,
  type QueuedCelebration,
} from '@/lib/achievements/celebration';
import type { AchievementRarity } from '@/lib/constants/achievements';

/** Normalised event consumed by AchievementPopup. */
export interface AchievementCelebration {
  id: string;
  /**
   * The `Achievement` row id.
   *
   * `id` is the catalogue definition id, which is what the page's `?highlight=`
   * matches on; `recordId` is what `POST /api/achievements/celebrate` updates by.
   * Carrying both means marking a badge seen needs no second lookup request.
   * `null` for an event that has no row yet.
   */
  recordId: string | null;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tier?: AchievementRarity;
  unlockedAt?: string;
}

/** Raw event shape returned by POST /api/achievements/unlock. */
interface UnlockEventRow {
  achievementId: string;
  recordId?: string | null;
  title: string;
  description: string;
  icon: string;
  color: string;
  rarity: AchievementRarity;
  unlockedAt: string;
}

interface AchievementStoreState {
  /** Queue of not-yet-dismissed celebrations, newest unlock first. */
  events: QueuedCelebration[];
  /** Push freshly unlocked achievements (deduped by id, newest first). */
  pushEvents: (events: QueuedCelebration[]) => void;
  /** Remove the front event (called when a toast is dismissed). */
  dismissFirst: () => void;
}

function toCelebration(row: UnlockEventRow): AchievementCelebration {
  return {
    id: row.achievementId,
    recordId: row.recordId ?? null,
    name: row.title,
    description: row.description || undefined,
    icon: row.icon || undefined,
    color: row.color || undefined,
    tier: row.rarity,
    unlockedAt: row.unlockedAt,
  };
}

export const useAchievementStore = create<AchievementStoreState>()((set) => ({
  events: [],

  /*
    One queue, and it is the store's.

    `AchievementPopup` used to keep a second queue of its own and append to it on
    every render of its `achievement` prop, while this store appended the same
    unlock again. One badge could therefore produce two toasts, and an
    already-dismissed badge was re-queued whenever the parent re-rendered.

    Both now defer to `enqueueCelebrations`, which de-duplicates by id and caps the
    queue, so a catalogue addition unlocking a burst at once cannot leave the user
    sitting through an unbounded stack.
  */
  pushEvents: (incoming) =>
    set((state) => ({ events: enqueueCelebrations(state.events, incoming) })),

  dismissFirst: () =>
    set((state) => ({ events: dequeueCelebration(state.events) })),
}));

/**
 * Mark a badge as seen.
 *
 * ## Why this is fire-and-forget
 *
 * `celebrated` drives a "New" dot and the unseen count. Neither is worth blocking a
 * dismissal or a panel opening on, and a failure must not surface: the worst case
 * is that the dot reappears on the next load, which is the state the user was in
 * anyway. Every error path here is swallowed on purpose.
 *
 * ## Why the row id
 *
 * The endpoint updates `Achievement.celebrated` by the **row** id. Callers hold the
 * definition id (that is what the page, the URL and `UnlockEvent.achievementId` all
 * use), so passing the wrong one returns 404 and silently changes nothing - which is
 * exactly the state this feature was in before, with an endpoint nobody called.
 */
export async function markAchievementCelebrated(recordId: string | null | undefined): Promise<void> {
  if (!recordId) return;
  try {
    await apiRequest('/api/achievements/celebrate', {
      method: 'POST',
      body: { achievementId: recordId },
    });
  } catch {
    // Best-effort: a stale "New" dot is not worth an error.
  }
}

/**
 * Fire-and-forget unlock evaluation.
 *
 * Call after a data-changing action so achievement criteria that depend on the
 * affected aggregates are re-checked. Failures are swallowed — the primary
 * action's caller never sees them.
 */
export async function runAchievementCheck(): Promise<void> {
  try {
    const result = await apiRequest<{ count: number; unlocked: UnlockEventRow[] }>(
      '/api/achievements/unlock',
      { method: 'POST' }
    );
    const unlocked = result?.unlocked;
    if (!Array.isArray(unlocked) || unlocked.length === 0) return;
    useAchievementStore.getState().pushEvents(unlocked.map(toCelebration));
  } catch {
    // Best-effort: never surface unlock-check failures to the user.
  }
}