/**
 * Scoring Configuration
 * Detailed configuration for the scoring system
 */

import type { HabitTier } from '@prisma/client';

// ============================================================================
// Scoring Weights
// ============================================================================

export const SCORING_WEIGHTS = {
  // Tier weights (how much each tier contributes to total score)
  tiers: {
    GROWTH: 1.0,
    BONUS: 0.5,
    LIFESTYLE: 0.6,
    FLEXIBLE: 0.7,
    ALTERNATIVE: 1.0,
    OPTIONAL: 0.25,
    EXPERIMENTAL: 0.1,
    SPECIAL: 0.5,
    JUST_FOR_FUN: 0.2,
    UNDEFINED: 0.0,
  } as Record<HabitTier, number>,
  
  // Component weights (for overall score calculation)
  components: {
    habits: 0.7, // 70% from habits
    routine: 0.2, // 20% from routine completion
    sleep: 0.1, // 10% from sleep quality
  },
  
  // Minimum day multiplier
  minimumDayMultiplier: 0.5, // Minimum day scores count as 50% of normal
} as const;

// ============================================================================
// Score Bands
// ============================================================================

export const SCORE_BANDS = {
  perfect: { min: 95, max: 100, grade: 'A+' as const, label: 'Perfect', color: '#10b981' },
  excellent: { min: 85, max: 94, grade: 'A' as const, label: 'Excellent', color: '#22c55e' },
  good: { min: 70, max: 84, grade: 'B' as const, label: 'Good', color: '#84cc16' },
  fair: { min: 50, max: 69, grade: 'C' as const, label: 'Fair', color: '#eab308' },
  poor: { min: 30, max: 49, grade: 'D' as const, label: 'Poor', color: '#f97316' },
  incomplete: { min: 0, max: 29, grade: 'F' as const, label: 'Incomplete', color: '#ef4444' },
} as const;

// ============================================================================
// Points System
// ============================================================================

export const POINTS_SYSTEM = {
  // Base points for habit completion
  habitCompletion: {
    GROWTH: 10,
    BONUS: 5,
    LIFESTYLE: 5,
    FLEXIBLE: 7,
    ALTERNATIVE: 10,
    OPTIONAL: 3,
    EXPERIMENTAL: 2,
    SPECIAL: 5,
    JUST_FOR_FUN: 3,
    UNDEFINED: 0,
  } as Record<HabitTier, number>,
  
  // Bonus points for streaks
  streakBonus: {
    7: 5, // 1 week
    14: 10, // 2 weeks
    30: 25, // 1 month
    60: 50, // 2 months
    100: 100, // 100 days
    365: 365, // 1 year
  },
  
  // Bonus points for perfect days
  perfectDayBonus: 20,
  
  // Routine completion bonus
  routineCompletionBonus: 10,
  
  // Sleep quality bonus
  sleepQualityBonus: {
    excellent: 10, // 8+ hours, good quality
    good: 5, // 7-8 hours, decent quality
    fair: 2, // 6-7 hours
    poor: 0, // <6 hours
  },
} as const;

// ============================================================================
// Calculation Rules
// ============================================================================

export const CALCULATION_RULES = {
  // Minimum habits required for scoring
  minimumHabitsForScoring: 1,
  
  // How to handle missing data
  missingData: {
    treatAsZero: false, // If true, missing habit logs count as 0, else excluded from calculation
    includeInAverage: false, // Include days with no data in averages
  },
  
  // Rest day behavior
  restDay: {
    countInStreak: true, // Rest days don't break streak
    includeInScoring: false, // Rest days are not scored
  },
  
  // Minimum day behavior
  minimumDay: {
    countInStreak: true, // Minimum days count in streak
    scoringMultiplier: 0.5, // Count as 50% of regular score
    requireAllNonNegotiables: true, // Must complete all non-negotiable habits
  },
  
  // Partial completion
  partialCompletion: {
    enabled: true,
    minimumPercentage: 50, // Must complete at least 50% to count as partial
    scoreMultiplier: 0.7, // Partial completion worth 70% of full points
  },
  
  // Rounding
  rounding: {
    decimals: 2, // Round to 2 decimal places
    method: 'round' as 'round' | 'floor' | 'ceil',
  },
} as const;

// ============================================================================
// Thresholds
// ============================================================================

export const THRESHOLDS = {
  // Score thresholds for achievements
  achievements: {
    perfectDay: 95, // Score >= 95 = perfect day
    excellentDay: 85, // Score >= 85 = excellent day
    goodDay: 70, // Score >= 70 = good day
  },
  
  // Completion rate thresholds
  completionRate: {
    excellent: 90, // >= 90% completion
    good: 75, // >= 75% completion
    needsImprovement: 50, // < 50% completion
  },
  
  // Streak milestones
  streakMilestones: [7, 14, 21, 30, 60, 90, 100, 180, 365],
  
  // Warning thresholds
  warnings: {
    lowScore: 50, // Warn if score < 50
    lowCompletionRate: 60, // Warn if completion rate < 60%
    streakAtRisk: 3, // Warn if haven't completed in 3 days
  },
} as const;

// ============================================================================
// Display Settings
// ============================================================================

export const DISPLAY_SETTINGS = {
  // Score display format
  scoreFormat: {
    showPercentage: true,
    showGrade: true,
    showPoints: false,
    showBreakdown: true,
  },
  
  // Progress bar settings
  progressBar: {
    showPercentage: true,
    animated: true,
    colorCoded: true, // Use color based on score band
  },
  
  // Chart settings
  charts: {
    defaultPeriod: 30, // days
    showTrendLine: true,
    showAverage: true,
    smoothing: true,
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

export function getScoreBand(percentage: number) {
  if (percentage >= SCORE_BANDS.perfect.min) return SCORE_BANDS.perfect;
  if (percentage >= SCORE_BANDS.excellent.min) return SCORE_BANDS.excellent;
  if (percentage >= SCORE_BANDS.good.min) return SCORE_BANDS.good;
  if (percentage >= SCORE_BANDS.fair.min) return SCORE_BANDS.fair;
  if (percentage >= SCORE_BANDS.poor.min) return SCORE_BANDS.poor;
  return SCORE_BANDS.incomplete;
}

export function getTierWeight(tier: HabitTier): number {
  return SCORING_WEIGHTS.tiers[tier];
}

export function getTierPoints(tier: HabitTier): number {
  return POINTS_SYSTEM.habitCompletion[tier];
}

export function getStreakBonus(streakDays: number): number {
  const milestones = Object.keys(POINTS_SYSTEM.streakBonus)
    .map(Number)
    .sort((a, b) => b - a);
  
  for (const milestone of milestones) {
    if (streakDays >= milestone) {
      return POINTS_SYSTEM.streakBonus[milestone as keyof typeof POINTS_SYSTEM.streakBonus];
    }
  }
  
  return 0;
}

export function roundScore(score: number): number {
  const factor = Math.pow(10, CALCULATION_RULES.rounding.decimals);
  
  switch (CALCULATION_RULES.rounding.method) {
    case 'floor':
      return Math.floor(score * factor) / factor;
    case 'ceil':
      return Math.ceil(score * factor) / factor;
    case 'round':
    default:
      return Math.round(score * factor) / factor;
  }
}

export function isScoreExcellent(score: number): boolean {
  return score >= THRESHOLDS.achievements.excellentDay;
}

export function isScorePerfect(score: number): boolean {
  return score >= THRESHOLDS.achievements.perfectDay;
}

export function isCompletionRateGood(rate: number): boolean {
  return rate >= THRESHOLDS.completionRate.good;
}

export function shouldWarnLowScore(score: number): boolean {
  return score < THRESHOLDS.warnings.lowScore;
}