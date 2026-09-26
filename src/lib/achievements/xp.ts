/**
 * Derived XP / trophy-level math for achievements.
 *
 * XP is computed purely from a user's real `Achievement` rows (rarity of the
 * definition they unlocked) — nothing is persisted. Rarity tiers are worth
 * more, so rarer badges push the trophy level up faster. This module has no
 * DB access and no side effects; callers pass the plain API rows.
 */

import {
  ACHIEVEMENT_RARITIES,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import { getAchievementById } from './definitions';

/** XP awarded per rarity tier. */
export const ACHIEVEMENT_XP: Readonly<Record<AchievementRarity, number>> = {
  COMMON: 10,
  UNCOMMON: 25,
  RARE: 50,
  EPIC: 100,
  LEGENDARY: 250,
};

/** Default when a row's rarity cannot be resolved (treated as Common). */
export const UNKNOWN_ACHIEVEMENT_XP = ACHIEVEMENT_XP.COMMON;

/** Minimum XP required to go from `level` to `level + 1`. */
export function xpNeededForLevel(level: number): number {
  if (level < 1) return 0;
  return 100 + (level - 1) * 150;
}

/** Cumulative XP required to *reach* `level` (level 1 is always reachable). */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i += 1) {
    total += xpNeededForLevel(i);
  }
  return total;
}

export interface TrophyLevelInfo {
  /** 1-based trophy level. */
  level: number;
  /** XP earned within the current level. */
  currentXp: number;
  /** Cumulative XP needed to reach the next level. */
  nextLevelAt: number;
  /** XP needed to advance from the current level (0 when maxed). */
  neededForNext: number;
  /** 0–1 progress toward the next level (0 when maxed). */
  progress: number;
  /** True when the top level is reached. */
  maxed: boolean;
}

/** Highest achievable level before the XP requirement becomes absurd. */
export const MAX_TROPHY_LEVEL = 50;

/**
 * Resolve the trophy level for a total XP figure.
 *
 * @example
 * computeTrophyLevel(0)   // => { level: 1, progress: 0, ... }
 * computeTrophyLevel(120) // => { level: 2, progress: 0.2, ... }
 */
export function computeTrophyLevel(xp: number): TrophyLevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;

  let level = 1;
  while (
    level < MAX_TROPHY_LEVEL &&
    safeXp >= cumulativeXpForLevel(level + 1)
  ) {
    level += 1;
  }

  const maxed = level >= MAX_TROPHY_LEVEL;
  const nextLevelAt = cumulativeXpForLevel(level + 1);
  const neededForNext = xpNeededForLevel(level);
  const currentXp = maxed
    ? neededForNext
    : Math.max(0, safeXp - cumulativeXpForLevel(level));

  return {
    level,
    currentXp,
    nextLevelAt,
    neededForNext,
    progress: maxed ? 1 : Math.min(1, currentXp / Math.max(1, neededForNext)),
    maxed,
  };
}

/**
 * Resolve the rarity of an unlocked achievement row.
 *
 * Unlocked rows store the definition's title; when the title matches the
 * catalog the rarity config is returned, otherwise `undefined` (callers fall
 * back to a flat tier). Mirrors how the achievements page matches rows.
 */
export function rarityOfTitle(title: string): AchievementRarity | undefined {
  return getAchievementById(title)?.rarity;
}

/**
 * XP earned by an unlocked achievement row.
 *
 * Rarity comes from the matching catalog definition; unknown titles are
 * credited at the flat Common rate so no real unlock scores zero XP.
 */
export function xpOfTitle(title: string): number {
  const rarity = rarityOfTitle(title);
  return rarity === undefined ? UNKNOWN_ACHIEVEMENT_XP : ACHIEVEMENT_XP[rarity];
}

/** Flat rarity tier used as a fallback when title matching fails. */
const TIER_ORDER = Object.keys(ACHIEVEMENT_RARITIES) as AchievementRarity[];

/**
 * Sum XP + resolved rarity for a raw achievement API row.
 *
 * `rarity` resolves by definition title; the numeric `level` column stores the
 * definition's threshold (not a tier index), so it is only used as a last
 * resort — clamped into the rarity ladder for planner-style displays.
 */
export interface AchievementXpRow {
  xp: number;
  rarity: AchievementRarity;
}

export function xpForRow(
  row: { title: string; level: number },
  rarityOverride?: AchievementRarity
): AchievementXpRow {
  const rarity = rarityOverride ?? rarityOfTitle(row.title);
  if (rarity !== undefined) {
    return { xp: ACHIEVEMENT_XP[rarity], rarity };
  }
  const clamped = TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, row.level - 1))] ?? 'COMMON';
  return { xp: ACHIEVEMENT_XP[clamped], rarity: clamped };
}