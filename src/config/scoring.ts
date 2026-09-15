/**
 * Scoring Engine Configuration
 *
 * All constants and formulas used by the RoutineOS scoring engine.
 * Centralizing these makes it easy to tune the scoring system
 * without touching business logic spread across multiple files.
 */

// ============================================================
// DEFAULT SCORING WEIGHTS
// ============================================================

/**
 * Default tier weights. These can be overridden per-user
 * through UserSettings.weightNonNeg / weightGrowth / weightBonus.
 */
export const DEFAULT_WEIGHTS = {
  /** Non-Negotiable tier — highest impact on overall score */
  nonNeg: 1.0,
  /** Growth tier — significant but less critical */
  growth: 0.5,
  /** Bonus tier — extra credit */
  bonus: 0.25,
} as const;

// ============================================================
// SCORE BANDS
// ============================================================

/**
 * Thresholds (inclusive lower bound) for each score band.
 * Scores are always 0–100.
 */
export const SCORE_BAND_THRESHOLDS = {
  EXCEPTIONAL: 95,
  EXCELLENT: 85,
  GREAT: 75,
  GOOD: 65,
  FAIR: 50,
  POOR: 25,
  FAILED: 0,
} as const;

// ============================================================
// DAY MODE MULTIPLIERS
// ============================================================

/**
 * Applied to the computed raw score based on day mode.
 * Normal days: no adjustment.
 * Minimum days: score is scaled differently (only NN required).
 * Rest days: score is fixed at 100 (full day off).
 * Missed days: score is 0.
 */
export const DAY_MODE_MULTIPLIERS = {
  NORMAL: 1.0,
  MINIMUM: 1.0,  // scoring logic handles minimum day rules separately
  REST: null,    // null means "no score computed" → fixed 100
  MISSED: 0.0,
} as const;

/** Fixed score assigned on Rest Day */
export const REST_DAY_SCORE = 100;

/** Fixed score assigned on Missed Day */
export const MISSED_DAY_SCORE = 0;

// ============================================================
// MINIMUM DAY RULES
// ============================================================

/**
 * On a Minimum Day, only Non-Negotiable habits count.
 * The score is computed solely from NN completion,
 * and Growth/Bonus do not penalize or benefit.
 */
export const MINIMUM_DAY_CONFIG = {
  /** Only these tiers count on a minimum day */
  tiersIncluded: ["NON_NEGOTIABLE"] as const,
  /** Score if all NNs completed */
  fullScore: 100,
  /** Score if NNs partially completed (proportional) */
  partialScore: "proportional" as const,
  /** Whether a minimum day counts toward streak */
  countsForStreak: true,
  /** Whether growth/bonus habits can still be logged (they just don't score) */
  allowNonScoredLog: true,
} as const;

// ============================================================
// STREAK RULES
// ============================================================

export const STREAK_CONFIG = {
  /** Non-Negotiable completion % required to continue streak */
  nonNegThreshold: 1.0, // 100% — all must be done

  /** Growth completion % required to count (for core streak) */
  growthThreshold: 0.6, // 60%

  /** Rest days preserve the streak without counting toward it */
  restDayPreservesStreak: true,

  /** Minimum days preserve the streak if NNs completed */
  minimumDayPreservesStreak: true,

  /** Grace period: days after a missed day before streak resets */
  gracePeriodDays: 0,

  /** Milestone intervals (days) for celebratory notifications */
  milestones: [3, 7, 14, 21, 30, 60, 90, 180, 365],
} as const;

// ============================================================
// SCORE FORMULA
// ============================================================

/**
 * Core score formula:
 *
 *   coreScore = (
 *     (nonNegRaw * weightNonNeg) +
 *     (growthRaw * weightGrowth) +
 *     (bonusRaw * weightBonus)
 *   ) / (weightNonNeg + weightGrowth + weightBonus) * 100
 *
 * Where rawTierScore = completed / total (0–1).
 * If a tier has 0 habits scheduled, it's excluded from the formula.
 */

/**
 * Calculate a raw tier completion ratio.
 * Returns 1.0 if no habits are scheduled (tier not applicable).
 */
export function calculateTierRatio(
  completed: number,
  total: number
): number {
  if (total === 0) return 1.0;
  return Math.min(1.0, completed / total);
}

/**
 * Calculate the weighted core score (0–100).
 */
export function calculateCoreScore(params: {
  nonNegCompleted: number;
  nonNegTotal: number;
  growthCompleted: number;
  growthTotal: number;
  bonusCompleted: number;
  bonusTotal: number;
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
}): number {
  const {
    nonNegCompleted,
    nonNegTotal,
    growthCompleted,
    growthTotal,
    bonusCompleted,
    bonusTotal,
    weightNonNeg,
    weightGrowth,
    weightBonus,
  } = params;

  let weightedSum = 0;
  let totalWeight = 0;

  if (nonNegTotal > 0) {
    weightedSum += calculateTierRatio(nonNegCompleted, nonNegTotal) * weightNonNeg;
    totalWeight += weightNonNeg;
  }

  if (growthTotal > 0) {
    weightedSum += calculateTierRatio(growthCompleted, growthTotal) * weightGrowth;
    totalWeight += weightGrowth;
  }

  // Bonus: only add bonus weight if bonus habits exist
  if (bonusTotal > 0) {
    weightedSum += calculateTierRatio(bonusCompleted, bonusTotal) * weightBonus;
    totalWeight += weightBonus;
  }

  if (totalWeight === 0) return 100; // No habits scheduled → full score

  const raw = (weightedSum / totalWeight) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ============================================================
// HISTORICAL INTEGRITY
// ============================================================

export const HISTORY_CONFIG = {
  /**
   * Default number of days in the past a user can retroactively
   * edit a habit log. Overridden by UserSettings.retroactiveEditDays.
   */
  defaultRetroactiveDays: 3,

  /**
   * Admins can retroactively edit up to this many days.
   */
  adminRetroactiveDays: 30,

  /**
   * Once a DailyScore is finalized, it is immutable unless
   * an admin override is applied.
   */
  finalizeAfterDays: 1,
} as const;

// ============================================================
// SCORE VALIDATION
// ============================================================

export function clampScore(score: number): number {
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function isValidScore(score: number): boolean {
  return score >= 0 && score <= 100 && Number.isFinite(score);
}
