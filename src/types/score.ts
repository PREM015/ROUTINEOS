import type { DailyScore } from '@prisma/client';

/**
 * Scoring System Types
 * Complete type system for daily scoring and performance tracking
 */

// ============================================================================
// Core Score Types
// ============================================================================

export interface DailyScoreWithContext extends DailyScore {
  context: {
    isMinimumDay: boolean;
    isRestDay: boolean;
    dayType: string | null;
  };
  breakdown: ScoreBreakdown;
}

// ============================================================================
// Score Calculation
// ============================================================================

export interface ScoreBreakdown {
  core: {
    score: number;
    maxScore: number;
    percentage: number;
    habits: HabitScoreContribution[];
  };
  growth: {
    score: number;
    maxScore: number;
    percentage: number;
    habits: HabitScoreContribution[];
  };
  bonus: {
    score: number;
    maxScore: number;
    percentage: number;
    habits: HabitScoreContribution[];
  };
  total: {
    score: number;
    maxScore: number;
    percentage: number;
  };
  grade: ScoreGrade;
}

export interface HabitScoreContribution {
  habitId: string;
  habitName: string;
  tier: string;
  status: string;
  points: number;
  weight: number;
  contribution: number;
}

// ============================================================================
// Score Calculation Input
// ============================================================================

export interface CalculateDailyScoreInput {
  userId: string;
  date: string; // YYYY-MM-DD
  isMinimumDay?: boolean;
  minimumDayTemplateId?: string;
  minimumDayReason?: string;
  isRestDay?: boolean;
  restDayReason?: string;
  contextTags?: string[];
}

export interface CalculateDailyScoreResponse {
  success: boolean;
  score?: DailyScoreWithContext;
  message?: string;
}

// ============================================================================
// Score Settings
// ============================================================================

export interface ScoreSettings {
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
  minimumDayThreshold: number; // minimum core score percentage for minimum day
  perfectDayThreshold: number; // score percentage for perfect day
  excellentDayThreshold: number;
  goodDayThreshold: number;
}

export interface UpdateScoreSettingsInput {
  weightNonNeg?: number;
  weightGrowth?: number;
  weightBonus?: number;
}

export interface UpdateScoreSettingsResponse {
  success: boolean;
  settings?: ScoreSettings;
  message?: string;
}

// ============================================================================
// Score Grades
// ============================================================================

export type ScoreGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreGradeInfo {
  grade: ScoreGrade;
  label: string;
  description: string;
  color: string;
  minPercentage: number;
  maxPercentage: number;
}

export const SCORE_GRADES: Record<ScoreGrade, ScoreGradeInfo> = {
  'A+': {
    grade: 'A+',
    label: 'Perfect',
    description: 'Outstanding performance!',
    color: '#10b981',
    minPercentage: 95,
    maxPercentage: 100,
  },
  'A': {
    grade: 'A',
    label: 'Excellent',
    description: 'Great job!',
    color: '#22c55e',
    minPercentage: 85,
    maxPercentage: 94,
  },
  'B': {
    grade: 'B',
    label: 'Good',
    description: 'Well done',
    color: '#84cc16',
    minPercentage: 70,
    maxPercentage: 84,
  },
  'C': {
    grade: 'C',
    label: 'Fair',
    description: 'Keep going',
    color: '#eab308',
    minPercentage: 50,
    maxPercentage: 69,
  },
  'D': {
    grade: 'D',
    label: 'Poor',
    description: 'Room for improvement',
    color: '#f97316',
    minPercentage: 30,
    maxPercentage: 49,
  },
  'F': {
    grade: 'F',
    label: 'Incomplete',
    description: 'Try again tomorrow',
    color: '#ef4444',
    minPercentage: 0,
    maxPercentage: 29,
  },
};

// ============================================================================
// Score Analytics
// ============================================================================

export interface ScoreAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  averages: {
    coreScore: number;
    growthScore: number;
    bonusScore: number;
    totalScore: number;
  };
  distribution: {
    grade: ScoreGrade;
    count: number;
    percentage: number;
  }[];
  trends: {
    date: string;
    coreScore: number;
    growthScore: number;
    bonusScore: number;
    totalScore: number;
    grade: ScoreGrade;
  }[];
  best: {
    date: string;
    score: number;
    grade: ScoreGrade;
  } | null;
  worst: {
    date: string;
    score: number;
    grade: ScoreGrade;
  } | null;
  streaks: {
    currentPerfectDays: number;
    longestPerfectDays: number;
    currentExcellentDays: number;
    longestExcellentDays: number;
  };
  specialDays: {
    minimumDays: number;
    restDays: number;
    perfectDays: number;
  };
}

// ============================================================================
// Score Comparison
// ============================================================================

export interface ScoreComparison {
  current: {
    period: string;
    averageScore: number;
    grade: ScoreGrade;
  };
  previous: {
    period: string;
    averageScore: number;
    grade: ScoreGrade;
  };
  change: {
    absolute: number;
    percentage: number;
    improved: boolean;
  };
  insights: string[];
}

// ============================================================================
// Minimum Day & Rest Day
// ============================================================================

export interface ActivateMinimumDayInput {
  date: string;
  templateId?: string;
  reason?: string;
}

export interface ActivateMinimumDayResponse {
  success: boolean;
  score?: DailyScoreWithContext;
  message?: string;
}

export interface ActivateRestDayInput {
  date: string;
  reason?: string;
}

export interface ActivateRestDayResponse {
  success: boolean;
  score?: DailyScoreWithContext;
  message?: string;
}

// ============================================================================
// Score History
// ============================================================================

export interface ScoreHistoryEntry {
  date: string;
  coreScore: number | null;
  growthScore: number | null;
  bonusScore: number | null;
  totalScore: number | null;
  grade: ScoreGrade | null;
  isMinimumDay: boolean;
  isRestDay: boolean;
  habitCompletionRate: number | null;
  routineCompletionRate: number | null;
}

export interface ScoreHistoryRange {
  startDate: string;
  endDate: string;
  entries: ScoreHistoryEntry[];
  summary: {
    daysWithData: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    mostCommonGrade: ScoreGrade;
  };
}

// ============================================================================
// Score Snapshot
// ============================================================================

export interface ScoreSnapshot {
  date: string;
  weights: {
    nonNeg: number;
    growth: number;
    bonus: number;
  };
  habits: Array<{
    id: string;
    name: string;
    tier: string;
    points: number;
    status: string;
  }>;
  calculationData: {
    coreHabits: number;
    coreCompleted: number;
    growthHabits: number;
    growthCompleted: number;
    bonusHabits: number;
    bonusCompleted: number;
  };
  metadata: {
    calculatedAt: Date;
    version: string;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getGradeFromPercentage(percentage: number): ScoreGrade {
  if (percentage >= 95) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 30) return 'D';
  return 'F';
}

export function getGradeInfo(grade: ScoreGrade): ScoreGradeInfo {
  return SCORE_GRADES[grade];
}

export function calculateTotalScore(
  coreScore: number,
  growthScore: number,
  bonusScore: number,
  weights: { nonNeg: number; growth: number; bonus: number }
): number {
  return (
    coreScore * weights.nonNeg +
    growthScore * weights.growth +
    bonusScore * weights.bonus
  );
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDailyScoreWithContext(
  score: unknown
): score is DailyScoreWithContext {
  return (
    typeof score === 'object' &&
    score !== null &&
    'id' in score &&
    'breakdown' in score &&
    'context' in score
  );
}

export function isValidScoreGrade(grade: unknown): grade is ScoreGrade {
  return (
    typeof grade === 'string' &&
    ['A+', 'A', 'B', 'C', 'D', 'F'].includes(grade)
  );
}