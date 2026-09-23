import type { Period } from '@/lib/period-range';

export interface RecapScorePoint {
  date: string;
  totalScore: number;
  core: number;
  growth: number;
  bonus: number;
}

export interface RecapReport {
  period: Period;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  hasData: boolean;
  points: RecapScorePoint[];
  day?: {
    score: {
      total: number | null;
      grade: string | null;
      isMinimumDay: boolean;
      isRestDay: boolean;
    };
    habitReliability: number;
    routine: { completed: number; total: number; completionRate: number };
    sleep: {
      logged: boolean;
      durationMinutes: number | null;
      metTarget: boolean | null;
    };
    tiers: Array<{ tier: string; total: number; completed: number; completionRate: number }>;
    topMoments: string[];
    bottomMoments: string[];
  };
  week?: {
    scores: {
      average: number;
      perfectDays: number;
      excellentDays: number;
      bestDay: { date: string; score: number } | null;
      worstDay: { date: string; score: number } | null;
    };
    habits: {
      averageCompletionRate: number;
      mostCompleted: { habitName: string; completionRate: number } | null;
    };
    sleep: { averageDuration: number; loggedDays: number };
    trend: { previousAverage: number; delta: number };
    streaks: { current: number; longest: number };
  };
  month?: {
    scores: {
      average: number;
      perfectDays: number;
      excellentDays: number;
      bestDay: { date: string; score: number } | null;
      worstDay: { date: string; score: number } | null;
      byTier: Array<{ tier: string; count: number; completionRate: number }>;
    };
    habits: {
      averageCompletionRate: number;
      totalCompleted: number;
      totalMissed: number;
      perHabit: Array<{ habitName: string; completionRate: number; weeklyRates: Array<number | null> }>;
    };
    focus: { totalSessions: number; totalFocusMinutes: number };
    journal: { entryCount: number };
    goals: { completed: number; milestonesHit: number };
    sleep: { averageDuration: number; nightsMeetingTarget: number };
  };
  year?: {
    totalDaysScored: number;
    averageScore: number;
    bestMonth: { month: string; averageScore: number } | null;
    worstMonth: { month: string; averageScore: number } | null;
    monthlyScoreTrend: Array<{ month: string; days: number; averageScore: number }>;
    habits: {
      averageCompletionRate: number;
      totalCompleted: number;
      totalMissed: number;
      bestHabit: { habitName: string; completionRate: number } | null;
    };
    streaks: { current: number; longest: number };
    goals: { completed: number; averageProgress: number };
    focus: { totalSessions: number; totalFocusMinutes: number };
    journal: { entryCount: number };
  };
}