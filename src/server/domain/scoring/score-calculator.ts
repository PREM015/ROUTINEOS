/**
 * Score Calculator – pure daily scoring math.
 * Combines bucket scores (non-neg, growth, bonus, core), applies rest-day /
 * minimum-day rules, and normalizes to 0..100. Weights + thresholds come from
 * src/config/scoring.ts. No DB access.
 */

import {
  SCORING_WEIGHTS,
  THRESHOLDS,
  CALCULATION_RULES,
  roundScore,
  getScoreBand,
} from '@/config/scoring';

import type { TierWeights } from './tier-weights';
import { DEFAULT_TIER_WEIGHTS, weightForTier } from './tier-weights';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw per-bucket percentages for a day. `null` means the bucket was not
 * scheduled/measured (excluded from the total instead of counting as zero).
 */
export interface BucketScores {
  nonNeg: number | null;
  growth: number | null;
  bonus: number | null;
  core: number | null;
}

export interface DayScoreResult {
  totalScore: number;
  coreScore: number | null;
  growthScore: number | null;
  bonusScore: number | null;
  normalized: boolean;
  restAdjusted: boolean;
  minimumAdjusted: boolean;
  band: ReturnType<typeof getScoreBand>;
}

export interface ScoreSnapshot {
  total: number;
  buckets: BucketScores;
  readonly weights: Readonly<TierWeights>;
  at: string;
}

// ============================================================================
// Bucket math
// ============================================================================

/**
 * Weight of a habit tier under a weights map.
 * @example
 * bucketWeight('GROWTH', DEFAULT_TIER_WEIGHTS) // => 1
 */
export function bucketWeight(
  tier: Parameters<typeof weightForTier>[0],
  weights: TierWeights = DEFAULT_TIER_WEIGHTS,
): number {
  return weightForTier(tier, weights);
}

/**
 * Combine per-bucket average percentages into a 0..100 total using the
 * component weights and tier bucket weights.
 * @example
 * calculateOverallScore({ nonNeg: 100, growth: 80, bonus: null, core: undefined })
 * // => weighted total using SCORING_WEIGHTS.components.habits
 */
export function calculateOverallScore(
  buckets: BucketScores,
  weights: TierWeights = DEFAULT_TIER_WEIGHTS,
): number {
  type PresentBucket = { value: number; bucketKey: keyof BucketScores };

  const present: PresentBucket[] = [];
  for (const key of ['nonNeg', 'growth', 'bonus', 'core'] as const) {
    const value = buckets[key];
    if (value !== null && value !== undefined) {
      present.push({ value, bucketKey: key });
    }
  }

  if (present.length === 0) return 0;

  // Within-habit weighting: each tier bucket contributes its share of the
  // habits component. Buckets are weighted by their tier weight so a bonus
  // tier's percentage counts less than a growth tier's.
  const weightedSum = present.reduce(
    (sum, { value, bucketKey }) => {
      const w = bucketWeightFor(bucketKey, weights);
      return sum + value * w;
    },
    0,
  );
  const weightTotal = present.reduce(
    (sum, { bucketKey }) => sum + bucketWeightFor(bucketKey, weights),
    0,
  );

  const habitsPortion = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Habits / routine / sleep components each map onto this bucket input.
  // Without routine & sleep inputs, habits is treated as their proxy when
  // only habit data is supplied (per-component weights otherwise).
  const total =
    habitsPortion * (SCORING_WEIGHTS.components.habits +
      SCORING_WEIGHTS.components.routine +
      SCORING_WEIGHTS.components.sleep);

  return normalizeScore(total);
}

/** Resolve a bucket name to its tier weight under a weights map. */
function bucketWeightFor(
  bucketKey: keyof BucketScores,
  weights: TierWeights,
): number {
  switch (bucketKey) {
    case 'nonNeg':
      return weights.weightNonNeg;
    case 'growth':
      return weights.weightGrowth;
    case 'bonus':
      return weights.weightBonus;
    case 'core':
      // Core bucket averages all non-growth/non-bonus tiers.
      return SCORING_WEIGHTS.tiers.UNDEFINED ?? 0;
  }
}

// ============================================================================
// Day rules
// ============================================================================

/**
 * Rest days are not scored – return 0 (or the provided fallback).
 * @example
 * applyRestDayRule(72.5, true) // => 0
 */
export function applyRestDayRule(score: number, isRestDay: boolean): number {
  if (!isRestDay) return score;
  return CALCULATION_RULES.restDay.includeInScoring ? score : 0;
}

/**
 * Minimum days count at a reduced multiplier.
 * @example
 * applyMinimumDayRule(80, true) // => 80 * 0.5
 */
export function applyMinimumDayRule(score: number, isMinimumDay: boolean): number {
  if (!isMinimumDay) return score;
  const multiplier = CALCULATION_RULES.minimumDay.scoringMultiplier;
  return score * multiplier;
}

/** Missing/overdue days contribute zero toward streaks/scoring. */
export function scoreForMissedDay(): number {
  return 0;
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Clamp into 0..100 and round per SCORING config.
 * @example
 * normalizeScore(137) // => 100
 * normalizeScore(-10) // => 0
 */
export function normalizeScore(score: number): number {
  return roundScore(Math.min(100, Math.max(0, score)));
}

// ============================================================================
// Achievements & snapshots
// ============================================================================

/** Whether a score qualifies as a perfect day (>= 95). */
export function isPerfectDay(score: number): boolean {
  return score >= THRESHOLDS.achievements.perfectDay;
}

/** Whether a score qualifies as an excellent day (>= 85). */
export function isExcellentDay(score: number): boolean {
  return score >= THRESHOLDS.achievements.excellentDay;
}

/**
 * Compute a day result from bucket inputs applying all rules.
 * @example
 * computeDayScore({ nonNeg: 100, growth: 80, bonus: null, core: undefined })
 * // => { totalScore: <weighted total>, restAdjusted: false, ... }
 */
export function computeDayScore(
  buckets: BucketScores,
  opts: {
    weights?: TierWeights;
    isRestDay?: boolean;
    isMinimumDay?: boolean;
  } = {},
): DayScoreResult {
  const { weights = DEFAULT_TIER_WEIGHTS, isRestDay = false, isMinimumDay = false } = opts;

  let total = calculateOverallScore(buckets, weights);
  const restAdjusted = isRestDay;
  total = applyRestDayRule(total, isRestDay);
  const minimumAdjusted = isMinimumDay;
  total = applyMinimumDayRule(total, isMinimumDay);

  return {
    totalScore: normalizeScore(total),
    coreScore: buckets.core ?? null,
    growthScore: buckets.growth ?? null,
    bonusScore: buckets.bonus ?? null,
    normalized: true,
    restAdjusted,
    minimumAdjusted,
    band: getScoreBand(normalizeScore(total)),
  };
}

/**
 * Immutable snapshot of a score at a point in time.
 * @example
 * snapshotScore(85.2, { nonNeg: 100, growth: 80, bonus: 50, core: 70 })
 * // => { total: 85.2, buckets: {...}, at: <iso> }
 */
export function snapshotScore(
  total: number,
  buckets: BucketScores,
  weights: TierWeights = DEFAULT_TIER_WEIGHTS,
  at: string = new Date().toISOString(),
): ScoreSnapshot {
  return {
    total: normalizeScore(total),
    buckets: { ...buckets },
    weights: Object.freeze({ ...weights }),
    at,
  };
}

// ============================================================================
// Re-exports
// ============================================================================

export { getScoreBand, roundScore };
export type { TierWeights };