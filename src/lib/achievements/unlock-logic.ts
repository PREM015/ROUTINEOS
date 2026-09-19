/**
 * Unlock evaluation and celebration helpers for achievements.
 *
 * Pure module layered on top of `definitions` and `checker`: it decides which
 * definitions newly qualify for a user, tests ownership, and builds the event
 * payloads consumers (notification, email, UI) need. No DB access.
 */

import type { AchievementType } from '@prisma/client';
import type {
  AchievementCategory,
  AchievementDefinitionConfig,
  AchievementRarity,
} from '@/lib/constants/achievements';
import { allDefinitions, getAchievementById } from './definitions';
import { checkDefinition, type AchievementWorldState } from './checker';

/**
 * Whether a definition id is present in the owned/collected id list.
 *
 * @example
 * hasUnlocked('habit-streak-7', ['first-habit-streak']) // => false
 */
export function hasUnlocked(
  defId: string,
  ownedIds: readonly string[]
): boolean {
  return ownedIds.includes(defId);
}

/**
 * Definitions whose criteria are currently met that the user does not yet own.
 *
 * `_userId` is reserved for future per-user state resolution; evaluation is
 * purely a function of `state` and `ownedIds`.
 */
export function evaluateUnlocks(
  _userId: string,
  state: AchievementWorldState,
  ownedIds: readonly string[]
): AchievementDefinitionConfig[] {
  return allDefinitions.filter(
    (definition) =>
      checkDefinition(definition, state) && !hasUnlocked(definition.id, ownedIds)
  );
}

/**
 * Options controlling the celebration decision.
 */
export interface CelebrateOptions {
  /** Whether the achievement has already been celebrated. */
  celebrated?: boolean;
  /** When the achievement was unlocked (default: treated as brand new). */
  unlockedAt?: Date | string | null;
  /** Reference "now" for the recency window (default: actual now). */
  now?: Date;
  /** Number of days an unlock is still considered celebratable. */
  recentWindowDays?: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Whether an achievement may be celebrated.
 *
 * Fails closed for unknown ids, an already-celebrated achievement, or an unlock
 * older than the recency window. An unknown/invalid unlock date is treated as
 * newly unlocked (celebratable) so a freshly persisted achievement triggers its
 * celebration flow.
 */
export function canCelebrate(
  defId: string,
  options: CelebrateOptions = {}
): boolean {
  const definition = getAchievementById(defId);
  if (!definition) return false;

  if (options.celebrated) return false;
  if (options.unlockedAt === undefined || options.unlockedAt === null) {
    return true;
  }

  const unlocked =
    options.unlockedAt instanceof Date
      ? options.unlockedAt
      : new Date(options.unlockedAt);
  if (Number.isNaN(unlocked.getTime())) return true;

  const current = options.now ?? new Date();
  const windowMs = (options.recentWindowDays ?? 7) * MS_PER_DAY;
  return current.getTime() - unlocked.getTime() <= windowMs;
}

/**
 * Event payload describing an achievement unlock. Consumed by notification,
 * email templates and confetti/celebration UI.
 */
export interface UnlockEvent {
  achievementId: string;
  type: AchievementType;
  title: string;
  description: string;
  icon: string;
  color: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  /** ISO timestamp of the unlock. */
  unlockedAt: string;
}

/**
 * Build the unlock event for a definition.
 *
 * @example
 * const def = getAchievementById('habit-streak-7')!;
 * buildUnlockEvent(def);
 * // => { achievementId: 'habit-streak-7', type: 'HABIT_STREAK', title: 'One Week Strong', ... }
 */
export function buildUnlockEvent(
  definition: AchievementDefinitionConfig,
  unlockedAt: Date = new Date()
): UnlockEvent {
  return {
    achievementId: definition.id,
    type: definition.type,
    title: definition.name,
    description: definition.description,
    icon: definition.icon,
    color: definition.color,
    rarity: definition.rarity,
    category: definition.category,
    unlockedAt: unlockedAt.toISOString(),
  };
}