/**
 * Derived XP / trophy-level math for achievements.
 *
 * XP is computed purely from a user's real `Achievement` rows (rarity of the
 * definition they unlocked) — nothing is persisted. Rarity tiers are worth
 * more, so rarer badges push the trophy level up faster. This module has no
 * DB access and no side effects; callers pass the plain API rows.
 */

import { type AchievementRarity } from '@/lib/constants/achievements';
import { getAchievementById, getAchievementByName } from './definitions';

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

/**
 * Rarity credited to a row that is not in the catalogue at all (a custom or
 * user-created achievement). Stated rather than derived, so the grid, the
 * history and the showcase cannot disagree about an unrecognised row.
 */
export const UNKNOWN_ACHIEVEMENT_RARITY: AchievementRarity = 'COMMON';

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
 * Resolve the rarity of a catalogue achievement by its stable definition id.
 *
 * @example
 * rarityOfDefinitionId('habit-streak-7') // => 'UNCOMMON'
 * rarityOfDefinitionId('One Week Strong') // => undefined (a title is not an id)
 */
export function rarityOfDefinitionId(
  definitionId: string
): AchievementRarity | undefined {
  return getAchievementById(definitionId)?.rarity;
}

/**
 * Resolve the rarity of an unlocked `Achievement` row.
 *
 * `definitionId` (the canonical join key, stored on the row and mirrored in
 * `metadata`) is authoritative. Rows written before the column existed carry only
 * a `metadata.definitionId`, and truly custom rows carry neither, so the title
 * is a *last* resort for matching a legacy row back to the catalogue.
 *
 * `undefined` means "not in the catalogue" — the caller decides the fallback, and
 * it must be an explicit constant rather than a guess. In particular the
 * numeric `level` column is the definition's *threshold* (7 for a 7-day streak),
 * not a rarity index, so it can never stand in for one.
 */
export function rarityOfRow(row: {
  definitionId?: string | null;
  title: string;
}): AchievementRarity | undefined {
  if (row.definitionId) {
    const byId = rarityOfDefinitionId(row.definitionId);
    if (byId) return byId;
  }
  return getAchievementByName(row.title)?.rarity;
}

/**
 * XP earned by an unlocked achievement row.
 *
 * Rarity comes from the matching catalogue definition; unknown rows are credited
 * at the flat Common rate so no real unlock scores zero XP.
 */
export function xpOfTitle(title: string): number {
  return xpForRow({ title }).xp;
}

/**
 * Sum XP + resolved rarity for a raw achievement API row.
 *
 * A row that cannot be matched to the catalogue is credited the explicit
 * `UNKNOWN_ACHIEVEMENT_RARITY`, which is a stated default rather than a derived
 * one: every other consumer of the grid, the history and the showcase resolves
 * rarity the same way, so a legacy row cannot be `COMMON` in the summary and
 * `EPIC` in the history.
 */
export interface AchievementXpRow {
  xp: number;
  rarity: AchievementRarity;
}

export function xpForRow(
  row: { definitionId?: string | null; title: string },
  rarityOverride?: AchievementRarity
): AchievementXpRow {
  const rarity = rarityOverride ?? rarityOfRow(row) ?? UNKNOWN_ACHIEVEMENT_RARITY;
  return { xp: ACHIEVEMENT_XP[rarity], rarity };
}