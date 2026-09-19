/**
 * Tier Weights – pure domain logic mapping habit tiers to score weights.
 * Sources canonical values from src/config/scoring.ts.
 * No DB access.
 */

import {
  SCORING_WEIGHTS,
  POINTS_SYSTEM,
} from '@/config/scoring';
import type { HabitTier } from '@/generated/prisma/client';

// ============================================================================
// Types
// ============================================================================

/** Buckets used by the day-score calculator. */
export type ScoreBucket = 'nonNeg' | 'growth' | 'bonus' | 'core';

/** Weights for the dedicated tier buckets (base, growth, bonus). */
export interface TierWeights {
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
}

export type { HabitTier };

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default per-bucket weights.
 * @example
 * DEFAULT_TIER_WEIGHTS // => { weightNonNeg: 1, weightGrowth: 1, weightBonus: 0.5 }
 */
export const DEFAULT_TIER_WEIGHTS: TierWeights = {
  weightNonNeg: 1,
  weightGrowth: SCORING_WEIGHTS.tiers.GROWTH ?? 1,
  weightBonus: SCORING_WEIGHTS.tiers.BONUS ?? 0.5,
};

// ============================================================================
// Tier → bucket / weight
// ============================================================================

/**
 * Categorize a habit tier into a scoring bucket.
 * GROWTH and BONUS map to their named buckets; every other tier falls into
 * `core` (its weight is sourced directly from SCORING_WEIGHTS.tiers).
 * @example
 * categorizeTier('GROWTH') // => 'growth'
 * categorizeTier('BONUS') // => 'bonus'
 * categorizeTier('OPTIONAL') // => 'core'
 */
export function categorizeTier(tier: HabitTier): ScoreBucket {
  switch (tier) {
    case 'GROWTH':
      return 'growth';
    case 'BONUS':
      return 'bonus';
    default:
      return 'core';
  }
}

/**
 * Resolve the weight multiplier for a tier.
 * Without overrides this uses the canonical SCORING_WEIGHTS.tiers table
 * (which covers every HabitTier directly). With overrides, growth/bonus/base
 * buckets are replaced by the provided bucket weights; other tiers keep their
 * canonical weight.
 * @example
 * weightForTier('GROWTH') // => 1 (SCORING_WEIGHTS.tiers.GROWTH)
 * weightForTier('OPTIONAL', { weightBonus: 0.1 }) // => 0.25 (unchanged)
 */
export function weightForTier(
  tier: HabitTier,
  override?: Partial<TierWeights>,
): number {
  if (!override) {
    return SCORING_WEIGHTS.tiers[tier] ?? 0;
  }
  const bucket = categorizeTier(tier);
  switch (bucket) {
    case 'growth':
      return override.weightGrowth ?? SCORING_WEIGHTS.tiers.GROWTH ?? 1;
    case 'bonus':
      return override.weightBonus ?? SCORING_WEIGHTS.tiers.BONUS ?? 0.5;
    case 'nonNeg':
      return override.weightNonNeg ?? 1;
    default:
      return SCORING_WEIGHTS.tiers[tier] ?? 1;
  }
}

/**
 * Apply an explicit override to a tier's weight. When `overrideIsMultiplier`
 * is true the override value multiplies the base weight.
 * @example
 * applyWeightOverride('GROWTH', 1.5, true) // => 1 * 1.5
 */
export function applyWeightOverride(
  tier: HabitTier,
  override: number | null | undefined,
  overrideIsMultiplier = false,
): number {
  const base = weightForTier(tier);
  if (override === null || override === undefined) return base;
  return overrideIsMultiplier ? base * override : override;
}

/** Merge partial bucket overrides into a full set of weights. */
export function getTierWeight(
  base: TierWeights = DEFAULT_TIER_WEIGHTS,
  override?: Partial<TierWeights>,
): TierWeights {
  return { ...base, ...override };
}

/** Validate custom weights (must be finite non-negative). */
export function validateWeights(weights: TierWeights): boolean {
  return Object.values(weights).every(
    (w) => Number.isFinite(w) && w >= 0,
  );
}

// ============================================================================
// Points
// ============================================================================

/**
 * Base points awarded for completing a habit at a tier.
 * Falls back to growth points when tier is unknown.
 * @example
 * tierToPoints('GROWTH') // => 10
 */
export function tierToPoints(tier: HabitTier): number {
  return POINTS_SYSTEM.habitCompletion[tier] ?? POINTS_SYSTEM.habitCompletion.GROWTH ?? 10;
}