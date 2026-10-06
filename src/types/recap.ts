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
  /**
   * Per-day habit completion for the period.
   *
   * `scheduled` is the number of habits actually **due** that day under the
   * shared eligibility rule — the same figure the period heroes use — and
   * `noRecord` counts the due ones with no log row at all. A cell therefore has
   * three distinguishable states rather than two: completed, attempted, and
   * "I was due and recorded nothing".
   */
  habitHeatmap: Array<{
    date: string;
    completed: number;
    scheduled: number;
    noRecord: number;
  }>;
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

/**
 * How much of the window had anything scheduled at all.
 *
 * Exists because a completion rate over a window where four days had nothing
 * due is not a low score — it is a rate about nothing. Reporting the coverage
 * alongside it lets the page say something true ("3 of 7 days had anything
 * scheduled") instead of a percentage that reads like a verdict.
 */
export interface RecapHabitCoverage {
  /** Days in the window with at least one habit due. */
  dueDays: number;
  /** Days in the window considered, already clipped to today. */
  totalDays: number;
  /** `completed / scheduled` pooled, or `null` when nothing was ever due. */
  completionRate: number | null;
}

export interface RecapReport {
  period: Period;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  /** True when the resolved range contains today in the user's timezone. */
  isCurrent: boolean;
  /**
   * The weekday the server resolved this range against, reported so the client
   * navigates by the same week rather than re-guessing Monday.
   */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hasData: boolean;
  points: RecapScorePoint[];
  habitCoverage: RecapHabitCoverage;
  /**
   * Absent — not empty — when the period has no activity at all.
   *
   * The service skips the sixteen enrichment queries for a window it can prove
   * is empty, so an empty period genuinely has no `extras` object rather than
   * one full of empty arrays. Every render site guards it.
   */
  extras?: RecapExtras;
  day?: {
    score: {
      total: number | null;
      grade: string | null;
      isMinimumDay: boolean;
      isRestDay: boolean;
    };
    /** `null` when no habit was due that day. */
    habitReliability: number | null;
    routine: { completed: number; total: number; completionRate: number };
    sleep: {
      logged: boolean;
      durationMinutes: number | null;
      metTarget: boolean | null;
    };
    tiers: Array<{ tier: string; total: number; completed: number; completionRate: number | null }>;
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
      /** `null` when nothing was due all week. */
      averageCompletionRate: number | null;
      mostCompleted: { habitName: string; completionRate: number | null } | null;
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
      byTier: Array<{ tier: string; count: number; completionRate: number | null }>;
    };
habits: {
      /** `null` when nothing was due all month. */
      averageCompletionRate: number | null;
      totalCompleted: number;
      totalMissed: number;
      perHabit: Array<{ habitName: string; completionRate: number | null; weeklyRates: Array<number | null> }>;
    };
    focus: { totalSessions: number; totalFocusMinutes: number };
    journal: { entryCount: number };
    goals: { completed: number; milestonesHit: number };
    sleep: { averageDuration: number; nightsMeetingTarget: number };
  };
  year?: {
totalDaysScored: number;
    /** `null` when nothing at all was scored in the year. */
    averageScore: number | null;
    bestMonth: { month: string; averageScore: number } | null;
    worstMonth: { month: string; averageScore: number } | null;
    /** `averageScore` is `null` for a month with no scored day. */
    monthlyScoreTrend: Array<{ month: string; days: number; averageScore: number | null }>;
    habits: {
      /** `null` when nothing was due all year. */
      averageCompletionRate: number | null;
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