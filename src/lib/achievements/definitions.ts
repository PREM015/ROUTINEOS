/**
 * Achievement definitions and typed accessors.
 *
 * Re-exports the canonical registry from `@/lib/constants/achievements` and
 * adds runtime-friendly helpers: string-id lookups (safe for untrusted input)
 * and grouped listings. Pure module – no DB access, no side effects.
 */

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_RARITIES,
  findDefinitionsByCategory,
  findDefinitionsByRarity,
  getAchievementDefinition,
  getCategoryConfig,
  getRarityConfig,
  type AchievementCategory,
  type AchievementCategoryConfig,
  type AchievementCriteria,
  type AchievementDefinition,
  type AchievementDefinitionConfig,
  type AchievementDefinitionId,
  type AchievementRarity,
  type AchievementRarityConfig,
} from '@/lib/constants/achievements';

export {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_RARITIES,
  findDefinitionsByCategory,
  findDefinitionsByRarity,
  getAchievementDefinition,
  getCategoryConfig,
  getRarityConfig,
};

export type {
  AchievementCategory,
  AchievementCategoryConfig,
  AchievementCriteria,
  AchievementDefinition,
  AchievementDefinitionConfig,
  AchievementDefinitionId,
  AchievementRarity,
  AchievementRarityConfig,
};

/**
 * All achievement definitions as a plain array (stable order of the registry).
 */
export const allDefinitions: AchievementDefinitionConfig[] =
  Object.values(ACHIEVEMENT_DEFINITIONS);

/**
 * Look up an achievement definition by id.
 *
 * Accepts any string (including values from untrusted input such as query
 * params) and returns `undefined` when the id is not part of the registry.
 *
 * @example
 * getAchievementById('habit-streak-7')?.name // => "One Week Strong"
 */
export function getAchievementById(
  id: string
): AchievementDefinitionConfig | undefined {
  return ACHIEVEMENT_DEFINITIONS[id as AchievementDefinitionId];
}

/**
 * All definitions belonging to a category.
 *
 * @example
 * definitionsByCategory('CONSISTENCY').map(d => d.id)
 */
export function definitionsByCategory(
  category: AchievementCategory
): AchievementDefinitionConfig[] {
  return findDefinitionsByCategory(category);
}

/**
 * All definitions at a rarity tier.
 *
 * @example
 * definitionsByRarity('LEGENDARY').map(d => d.name)
 */
export function definitionsByRarity(
  rarity: AchievementRarity
): AchievementDefinitionConfig[] {
  return findDefinitionsByRarity(rarity);
}