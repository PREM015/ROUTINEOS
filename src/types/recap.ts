import type { Period } from '@/lib/period-range';

export interface RecapScorePoint {
  date: string;
  totalScore: number;
  core: number;
  growth: number;
  bonus: number;
}

/**
 * Optional enrichment block attached to every recap period. Every field is
 * derived from real rows; sections that have no data for the period are either
 * empty arrays or null so each card decides its own empty state.
 */
export interface RecapExtras {
  /** Per-day habit completion for the period (heatmap). */
  habitHeatmap: Array<{ date: string; completed: number; scheduled: number }>;
  /** Nightly sleep durations in the period. */
  sleepTrend: Array<{ date: string; durationMinutes: number | null }>;
  /** Daily mood + energy from reflections in the period. */
  moodEnergy: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    source: 'logs' | 'reflection';
    triggers: string[];
    activities: string[];
  }>;
  /** Focus minutes grouped by category name. */
  focusByCategory: Array<{ name: string; minutes: number; sessions: number }>;
  /** Goal movement during the period plus live progress of active goals. */
  goalsDelta: {
    completedInPeriod: number;
    activeCount: number;
    averageProgress: number;
  };
  /** Tasks created / completed in the period, and how many remain open. */
  taskThroughput: { created: number; completed: number; open: number };
  /** Nutrition summary — null when nothing was logged in the period. */
  nutrition: { entries: number; calories: number | null; daysLogged: number } | null;
  /** Health metric rows in the period — null when nothing was recorded. */
  health: Array<{ metricType: string; value: number; unit: string; date: string }> | null;
  /** Streak milestones reached within the period. */
  streakEvents: Array<{ type: string; days: number; reachedDate: string }>;
  /** Achievements unlocked within the period. */
  achievements: Array<{ title: string; description: string | null; unlockedAt: string }>;
  /** The weekly review / monthly reset linked to this period, if written. */
  linkedReview: {
    kind: 'weekly' | 'monthly';
    period: string;
    biggestWins: string | null;
    challenges: string | null;
    lessonsLearned: string | null;
    nextFocus: string | null;
    overallSatisfaction: number | null;
  } | null;
  /** Recent journal entries in the period (newest first). */
  journal: Array<{ date: string; title: string | null; snippet: string }>;
  /** Routine template exceptions in the period (why a day deviated). */
  routineExceptions: Array<{
    date: string;
    dayType: string;
    reason: string | null;
    note: string | null;
    templateName: string | null;
  }>;
  /** Goal milestones completed within the period (newest first). */
  milestoneHits: Array<{
    id: string;
    title: string;
    description: string | null;
    goalTitle: string;
    projectTitle: string | null;
    completedAt: string; // YYYY-MM-DD
  }>;
  /** Days with narrative reflections (wins, learnings, gratitude, focus). */
  reflections: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    narrative: Array<{ label: string; value: string }>;
  }>;
}

export interface RecapReport {
  period: Period;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  hasData: boolean;
  points: RecapScorePoint[];
  extras?: RecapExtras;
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