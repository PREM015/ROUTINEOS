/**
 * Scoring Engine for RoutineOS
 * Calculates daily, weekly, monthly scores from habit logs.
 * Scores are computed from snapshots — changing habits later won't affect past scores.
 */

export interface HabitForScoring {
  id: string;
  tier: 'NON_NEGOTIABLE' | 'GROWTH' | 'BONUS';
  completed: boolean;
  scheduled: boolean; // is this habit scheduled for this day?
}

export interface ScoringWeights {
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  weightNonNeg: 1.0,
  weightGrowth: 0.5,
  weightBonus: 0.25,
};

export interface DayScoreResult {
  coreScore: number | null;      // % of Non-Negotiables completed (0–100), null when no core habits are scheduled
  growthScore: number | null;    // % of Growth habits completed (0–100), null when none are scheduled
  bonusScore: number | null;     // % of Bonus habits completed (0–100), null when none are scheduled
  totalScore: number;     // Weighted overall score (0–100)
  nnTotal: number;
  nnCompleted: number;
  growthTotal: number;
  growthCompleted: number;
  bonusTotal: number;
  bonusCompleted: number;
}

function toSafePercent(total: number, completed: number): number | null {
  if (total === 0) return null;
  return (completed / total) * 100;
}

export function calculateDayScore(
  habits: HabitForScoring[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  isRestDay = false,
  isMinimumDay = false,
  minimumDayHabitIds: string[] = []
): DayScoreResult {
  const scheduled = habits.filter(h => h.scheduled);

  let habitsToScore = scheduled;
  if (isMinimumDay && minimumDayHabitIds.length > 0) {
    habitsToScore = scheduled.filter(h => minimumDayHabitIds.includes(h.id));
  }

  const nn = habitsToScore.filter(h => h.tier === 'NON_NEGOTIABLE');
  const growth = habitsToScore.filter(h => h.tier === 'GROWTH');
  const bonus = habitsToScore.filter(h => h.tier === 'BONUS');

  const nnCompleted = nn.filter(h => h.completed).length;
  const growthCompleted = growth.filter(h => h.completed).length;
  const bonusCompleted = bonus.filter(h => h.completed).length;

  const coreScore = toSafePercent(nn.length, nnCompleted);
  const growthScore = toSafePercent(growth.length, growthCompleted);
  const bonusScore = toSafePercent(bonus.length, bonusCompleted);

  const weightedParts = [
    coreScore !== null ? coreScore * weights.weightNonNeg : null,
    growthScore !== null ? growthScore * weights.weightGrowth : null,
    bonusScore !== null ? bonusScore * weights.weightBonus : null,
  ].filter((value): value is number => value !== null);

  const weightedTotal = weightedParts.reduce((sum, value) => sum + value, 0);
  const totalWeight = [
    coreScore !== null ? weights.weightNonNeg : 0,
    growthScore !== null ? weights.weightGrowth : 0,
    bonusScore !== null ? weights.weightBonus : 0,
  ].reduce((sum, value) => sum + value, 0);

  const totalScore = isRestDay ? 0 : totalWeight > 0 ? (weightedTotal / totalWeight) : 0;

  return {
    coreScore: coreScore === null ? null : Math.round(coreScore * 10) / 10,
    growthScore: growthScore === null ? null : Math.round(growthScore * 10) / 10,
    bonusScore: bonusScore === null ? null : Math.round(bonusScore * 10) / 10,
    totalScore: Math.round(totalScore * 10) / 10,
    nnTotal: nn.length,
    nnCompleted,
    growthTotal: growth.length,
    growthCompleted,
    bonusTotal: bonus.length,
    bonusCompleted,
  };
}

export type WeeklyBand = 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'RESET';

export function getWeeklyBand(weeklyScore: number): WeeklyBand {
  if (weeklyScore >= 90) return 'EXCELLENT';
  if (weeklyScore >= 75) return 'GOOD';
  if (weeklyScore >= 60) return 'NEEDS_IMPROVEMENT';
  return 'RESET';
}

export function getWeeklyBandLabel(band: WeeklyBand): string {
  switch (band) {
    case 'EXCELLENT': return 'Excellent';
    case 'GOOD': return 'Good';
    case 'NEEDS_IMPROVEMENT': return 'Needs Improvement';
    case 'RESET': return 'Reset';
  }
}

export function getWeeklyBandColor(band: WeeklyBand): string {
  switch (band) {
    case 'EXCELLENT': return 'text-emerald-400';
    case 'GOOD': return 'text-teal-400';
    case 'NEEDS_IMPROVEMENT': return 'text-amber-400';
    case 'RESET': return 'text-red-400';
  }
}

export function calculateWeeklyScore(dailyCoreScores: Array<number | null>): number {
  const validScores = dailyCoreScores.filter((score): score is number => score !== null && Number.isFinite(score));
  if (validScores.length === 0) return 0;
  const sum = validScores.reduce((a, b) => a + b, 0);
  return Math.round((sum / validScores.length) * 10) / 10;
}

export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-teal-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

export function getHeatmapColor(score: number): string {
  if (score === 0) return 'bg-zinc-900';
  if (score < 40) return 'bg-emerald-950';
  if (score < 60) return 'bg-emerald-900';
  if (score < 75) return 'bg-emerald-700';
  if (score < 90) return 'bg-emerald-500';
  return 'bg-emerald-400';
}
