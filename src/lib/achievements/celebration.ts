/**
 * Celebration policy: how big a moment an unlock deserves, and the queue that
 * shows it.
 *
 * ## Why proportional
 *
 * Every achievement used to announce itself identically. A "First Streak" — one
 * habit, one day — got the same treatment as "Consistency King", four perfect
 * weeks in a row. Once a week every toast looks the same, the user learns that the
 * signal carries no information and stops attending to it, and the genuinely rare
 * unlock stops landing.
 *
 * So intensity is a function of rarity, stated once here rather than decided in a
 * component:
 *
 * | Rarity | Treatment | Auto-hide |
 * | ------ | --------- | --------- |
 * | Common, Uncommon | quiet toast | 7 s |
 * | Rare | quiet toast + glow | 9 s |
 * | Epic | stronger glow | 11 s |
 * | Legendary | one burst, longer | 14 s |
 *
 * The point is proportion, not spectacle: a Legendary earns a moment that is
 * visibly different, and everything below it stays calm.
 *
 * ## Reduced motion removes movement, never information
 *
 * `motion` is a separate field from `treatment`. Under reduced motion the burst
 * and the glow are dropped and the toast stays longer, because a Legendary still
 * deserves more of the user's attention — just not movement. Nothing about what
 * the toast *says* depends on this setting.
 */

import type { AchievementRarity } from '@/lib/constants/achievements';

export type CelebrationIntensity = 'quiet' | 'glow' | 'strong' | 'burst';

export interface CelebrationTreatment {
  intensity: CelebrationIntensity;
  /** Longer for rarer badges: the extra time is the reward. */
  autoHideMs: number;
  /** A single burst, Legendary only. Never repeated. */
  burst: boolean;
}

const TREATMENTS: Readonly<Record<AchievementRarity, CelebrationTreatment>> = {
  COMMON: { intensity: 'quiet', autoHideMs: 7000, burst: false },
  UNCOMMON: { intensity: 'quiet', autoHideMs: 7000, burst: false },
  RARE: { intensity: 'glow', autoHideMs: 9000, burst: false },
  EPIC: { intensity: 'strong', autoHideMs: 11_000, burst: false },
  LEGENDARY: { intensity: 'burst', autoHideMs: 14_000, burst: true },
};

/** The default for an event with no resolvable rarity. Deliberately the quietest. */
export const DEFAULT_CELEBRATION: CelebrationTreatment = TREATMENTS.COMMON;

export function celebrationTreatment(rarity: AchievementRarity | null | undefined): CelebrationTreatment {
  if (!rarity) return DEFAULT_CELEBRATION;
  return TREATMENTS[rarity] ?? DEFAULT_CELEBRATION;
}

// ============================================================================
// Queue
// ============================================================================

/** The minimum a toast needs to be identified and rendered. */
export interface QueuedCelebration {
  /** Stable identity: the catalogue definition id. */
  id: string;
  name: string;
  tier?: AchievementRarity;
}

/**
 * Add events to the queue, de-duplicated, with the incoming batch at the front.
 *
 * ## Why this exists
 *
 * `AchievementPopup` and the zustand store each kept their own queue and both
 * appended the same unlock, so one achievement could produce two toasts. It also
 * used to append on *every* render of the driving prop, which re-queued an
 * already-dismissed badge whenever the parent re-rendered.
 *
 * ## Ordering
 *
 * The incoming batch is prepended **as a block, in the order given**, and existing
 * entries follow. The batch order is not significance-ordered - it comes from the
 * unlock evaluation, which walks the catalogue - so re-sorting by rarity here would
 * imply the queue knows what matters to the user. It does not; it knows what
 * arrived.
 *
 * ## The cap
 *
 * `MAX_QUEUED_CELEBRATIONS` bounds how many toasts a user can be made to sit
 * through. A catalogue addition can unlock a burst at once, and each toast only
 * advances when the previous is dismissed or times out, so an unbounded queue is a
 * queue with no exit.
 *
 * The cap keeps the **front** of the merged list. Within a single oversized batch
 * that means the earliest in the order given, which is arbitrary — but capping is
 * a safety valve, not a ranking, and picking six "most impressive" would need a
 * significance order this layer deliberately does not have.
 */
export const MAX_QUEUED_CELEBRATIONS = 6;

export function enqueueCelebrations(
  queue: readonly QueuedCelebration[],
  incoming: readonly QueuedCelebration[]
): QueuedCelebration[] {
  if (incoming.length === 0) return [...queue];
  const seen = new Set(queue.map((entry) => entry.id));
  const fresh: QueuedCelebration[] = [];
  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    fresh.push(entry);
  }
  if (fresh.length === 0) return [...queue];
  return [...fresh, ...queue].slice(0, MAX_QUEUED_CELEBRATIONS);
}

/** Remove the front entry. Returns the same array when empty, so React can bail. */
export function dequeueCelebration(
  queue: readonly QueuedCelebration[]
): QueuedCelebration[] {
  return queue.length === 0 ? [...queue] : queue.slice(1);
}