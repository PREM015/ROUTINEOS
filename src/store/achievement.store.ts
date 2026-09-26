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
import type { AchievementRarity } from '@/lib/constants/achievements';

/** Normalised event consumed by AchievementPopup. */
export interface AchievementCelebration {
  id: string;
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
  title: string;
  description: string;
  icon: string;
  color: string;
  rarity: AchievementRarity;
  unlockedAt: string;
}

interface AchievementStoreState {
  /** Queue of not-yet-dismissed celebrations, newest unlock first. */
  events: AchievementCelebration[];
  /** Push freshly unlocked achievements (deduped by id, newest first). */
  pushEvents: (events: AchievementCelebration[]) => void;
  /** Remove the front event (called when a toast is dismissed). */
  dismissFirst: () => void;
}

function toCelebration(row: UnlockEventRow): AchievementCelebration {
  return {
    id: row.achievementId,
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

  pushEvents: (incoming) =>
    set((state) => {
      const held = new Map<string, AchievementCelebration>();
      for (const event of incoming) {
        if (!state.events.some((existing) => existing.id === event.id)) {
          held.set(event.id, event);
        }
      }
      const merged = [...new Set([...state.events, ...held.values()])];
      return { events: merged };
    }),

  dismissFirst: () =>
    set((state) => ({ events: state.events.slice(1) })),
}));

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