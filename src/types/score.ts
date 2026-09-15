/**
 * Score Types
 *
 * Complete type definitions for the RoutineOS scoring engine,
 * including daily scores, bands, snapshots, and tier scores.
 */

// ============================================================
// ENUMS
// ============================================================

export enum DayMode {
  NORMAL = "NORMAL",
  MINIMUM = "MINIMUM",
  REST = "REST",
  MISSED = "MISSED",
}

export enum ScoreBand {
  EXCEPTIONAL = "EXCEPTIONAL", // 95-100
  EXCELLENT = "EXCELLENT",     // 85-94
  GREAT = "GREAT",             // 75-84
  GOOD = "GOOD",               // 65-74
  FAIR = "FAIR",               // 50-64
  POOR = "POOR",               // 25-49
  FAILED = "FAILED",           // 0-24
}

// ============================================================
// TIER SCORE
// ============================================================

export interface TierScore {
  /** Number of habits completed */
  completed: number;
  /** Total number of habits eligible for today */
  total: number;
  /** Raw weighted score 0–100 */
  raw: number;
  /** Contribution weight (e.g. 1.0, 0.5, 0.25) */
  weight: number;
  /** Weighted contribution to overall score */
  weighted: number;
}

// ============================================================
// SCORE SNAPSHOT
// ============================================================

/**
 * Immutable snapshot of the scoring weights and configuration
 * captured at the time of calculation. Used for historical
 * integrity – changing weights doesn't retroactively alter past scores.
 */
export interface ScoreSnapshot {
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
  totalEligibleHabits: number;
  dayMode: DayMode;
  capturedAt: string; // ISO timestamp
}

// ============================================================
// DAILY SCORE
// ============================================================

export interface DailyScore {
  id: string;
  userId: string;
  date: string; // ISO date YYYY-MM-DD

  // Per-tier scores
  nonNegScore: number; // 0-100
  growthScore: number; // 0-100
  bonusScore: number;  // 0-100

  // Combined
  coreScore: number;   // weighted combination, 0-100
  overallScore: number; // final score after mode adjustments, 0-100

  // Context
  dayMode: DayMode;
  band: ScoreBand;

  // Habit counts
  nonNegCompleted: number;
  nonNegTotal: number;
  growthCompleted: number;
  growthTotal: number;
  bonusCompleted: number;
  bonusTotal: number;

  // Historical integrity snapshot
  snapshot: ScoreSnapshot;

  // Flags
  isFinalized: boolean;
  finalizedAt: Date | null;

  // Manual override
  manualOverride: boolean;
  manualOverrideReason: string | null;

  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SCORE COMPUTATION INPUTS
// ============================================================

export interface ScoreComputationInput {
  userId: string;
  date: string;
  dayMode: DayMode;
  nonNegCompleted: number;
  nonNegTotal: number;
  growthCompleted: number;
  growthTotal: number;
  bonusCompleted: number;
  bonusTotal: number;
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
}

export interface ScoreResult {
  nonNegScore: number;
  growthScore: number;
  bonusScore: number;
  coreScore: number;
  overallScore: number;
  band: ScoreBand;
}

// ============================================================
// SCORE DISPLAY HELPERS
// ============================================================

export interface ScoreBandConfig {
  band: ScoreBand;
  min: number;
  max: number;
  label: string;
  color: string;
  emoji: string;
}

export const SCORE_BANDS: ScoreBandConfig[] = [
  { band: ScoreBand.EXCEPTIONAL, min: 95, max: 100, label: "Exceptional", color: "#10b981", emoji: "🌟" },
  { band: ScoreBand.EXCELLENT,   min: 85, max: 94,  label: "Excellent",   color: "#22c55e", emoji: "✨" },
  { band: ScoreBand.GREAT,       min: 75, max: 84,  label: "Great",       color: "#84cc16", emoji: "🔥" },
  { band: ScoreBand.GOOD,        min: 65, max: 74,  label: "Good",        color: "#eab308", emoji: "👍" },
  { band: ScoreBand.FAIR,        min: 50, max: 64,  label: "Fair",        color: "#f97316", emoji: "🙂" },
  { band: ScoreBand.POOR,        min: 25, max: 49,  label: "Poor",        color: "#ef4444", emoji: "😔" },
  { band: ScoreBand.FAILED,      min: 0,  max: 24,  label: "Failed",      color: "#dc2626", emoji: "💔" },
];

export function getScoreBand(score: number): ScoreBand {
  if (score >= 95) return ScoreBand.EXCEPTIONAL;
  if (score >= 85) return ScoreBand.EXCELLENT;
  if (score >= 75) return ScoreBand.GREAT;
  if (score >= 65) return ScoreBand.GOOD;
  if (score >= 50) return ScoreBand.FAIR;
  if (score >= 25) return ScoreBand.POOR;
  return ScoreBand.FAILED;
}

export function getScoreBandConfig(band: ScoreBand): ScoreBandConfig {
  return SCORE_BANDS.find((b) => b.band === band) ?? SCORE_BANDS[6];
}

// ============================================================
// FORM DATA
// ============================================================

export interface SetDayModeInput {
  date: string;
  mode: DayMode;
  reason?: string;
}

export interface ManualScoreOverrideInput {
  date: string;
  overallScore: number;
  reason: string;
}
