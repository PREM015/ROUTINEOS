/**
 * Analytics Types
 *
 * Consolidated against the real aggregation core (src/server/analytics/*).
 * Every member here is consumed either by the aggregation core itself, an API
 * route, or a page. Interfaces that matched nothing being produced or consumed
 * have been removed — no theoretical types.
 */

import type { HabitTier, ProjectStatus } from '@/generated/prisma';
import type { Period } from '@/lib/period-range';

// ============================================================================
// Period Types
// ============================================================================

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// ============================================================================
// Streak Analytics
// ============================================================================

export interface StreakAnalytics {
  current: {
    total: number;
    core: number;
    growth: number;
    minimum: number;
  };

  longest: {
    total: number;
    core: number;
    growth: number;
    minimum: number;
  };

  history: {
    totalDays: number;
    completedDays: number;
    minimumDays: number;
    restDays: number;
    perfectDays: number;
  };

  milestones: Array<{
    type: string;
    days: number;
    reachedDate: string;
    celebrated: boolean;
  }>;

  timeline: Array<{
    date: string;
    hasStreak: boolean;
    isMinimumDay: boolean;
    isRestDay: boolean;
    score: number | null;
  }>;

  projections: {
    nextMilestone: number | null;
    daysToNextMilestone: number | null;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

// ============================================================================
// Live Dashboard Widgets
// All values are derived from real Prisma rows (never fabricated). Every widget
// independently decides its own empty state from these shapes.
// ============================================================================

export interface AnalyticsStreakSnapshot {
  current: number;
  core: number;
  growth: number;
  minimum: number;
  longest: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
}

/** One habit's contribution to the selected period. */
export interface AnalyticsHabitRow {
  habitId: string;
  name: string;
  tier: HabitTier;
  completed: number;
  /** Days it was due in the period. `0` means it was not due at all. */
  scheduled: number;
  /** `completed / scheduled`, or `null` when nothing was due. */
  rate: number | null;
}

/**
 * The habit panel, on one definition for every period.
 *
 * `rate` is `completed / scheduled`, where `scheduled` comes from the eligibility
 * rule - the same one the contribution heatmap uses. See
 * `lib/analytics/period-habits`, which replaced four disagreeing denominators
 * across the day / week / month / year tabs.
 */
export interface AnalyticsHabitPanel {
  completed: number;
  scheduled: number;
  rate: number | null;
  scheduledDays: number;
  fullDays: number;
  /** Days that were due and recorded nothing. Unknown, not failed. */
  noRecordDays: number;
  perHabit: AnalyticsHabitRow[];
}

/**
 * The immediately preceding equivalent period, for the headline comparison.
 *
 * `null` for month and year: comparing a part-lived month against a whole one
 * produces a flattering number, not a measurement.
 */
export interface AnalyticsComparison {
  start: string;
  end: string;
  /** `null` when the earlier period has no scored day. */
  average: number | null;
  delta: number | null;
}

export interface AnalyticsTierMix {
  tier: HabitTier;
  count: number;
}

export interface AnalyticsFocusSummary {
  /** Aggregates over the selected period range (FocusSession rows). */
  period: { sessions: number; minutes: number };
  /** Per-day average over the same range. */
  dailyAverage: { sessions: number; minutes: number };
  peakHours: string[];
  /** Break rows in the range: count, average length, break-to-focus ratio. */
  breaks: { count: number; averageMinutes: number | null; ratio: number | null };
}

export interface AnalyticsTaskQuadrant {
  urgentImportant: number;
  urgentNotImportant: number;
  importantNotUrgent: number;
  neither: number;
  open: number;
  overdue: number;
}

export interface AnalyticsProjectProgress {
  id: string;
  name: string;
  progress: number;
  status: ProjectStatus;
  color: string | null;
}

export interface AnalyticsMoodPulsePoint {
  timestamp: string;
  mood: number | null;
  energy: number | null;
}

export interface AnalyticsSleepSnapshot {
  date: string;
  durationMinutes: number | null;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  deficitMinutes: number | null;
  quality: number | null;
  feltRested: boolean | null;
  metTarget: boolean | null;
  /** Roll-up of every logged night in the selected period. */
  periodStats: {
    loggedDays: number;
    averageDurationMinutes: number | null;
  } | null;
}

export interface AnalyticsInsight {
  id: string;
  summary: string;
  period: string;
  generatedAt: string;
  wasHelpful: boolean | null;
}

/**
 * One bar of a chart.
 *
 * `value` is `number | null`. `null` means "we have no measurement here" — a month
 * with no scored day, or a habit that was never due in the window — and it must
 * render as a gap. Coercing it to `0` is how a year the user had not reached yet
 * came to look like a year of zero scores.
 */
export interface AnalyticsChartData {
  name: string;
  value: number | null;
}

export interface AnalyticsRoutineBlockBreakdown {
  blockId: string;
  title: string;
  startTime: string;
  /** Days in the period that produced a log for this block. */
  daysTracked: number;
  completed: number;
  missed: number;
  partial: number;
  completionRate: number;
}

export interface AnalyticsRoutineDetail {
  /** Distinct days in the period with at least one routine log. */
  daysTracked: number;
  blocks: AnalyticsRoutineBlockBreakdown[];
  mostMissed: AnalyticsRoutineBlockBreakdown | null;
}

export interface AnalyticsMilestoneHit {
  id: string;
  title: string;
  description: string | null;
  goalTitle: string;
  projectTitle: string | null;
  completedAt: string; // YYYY-MM-DD
}

export interface AnalyticsTimeAllocationEntry {
  label: string;
  minutes: number;
  color: string | null;
}

export interface AnalyticsTimeAllocation {
  /** Total tracked minutes in the period (TimeEntry rows). */
  totalMinutes: number;
  entries: AnalyticsTimeAllocationEntry[];
  /** Focus minutes grouped by focus-session category name. */
  focusByCategory: AnalyticsTimeAllocationEntry[];
}

export interface AnalyticsHealthMetric {
  metricType: string;
  value: number;
  unit: string;
  date: string; // YYYY-MM-DD
}

export interface AnalyticsJournalEntry {
  date: string; // YYYY-MM-DD
  title: string | null;
  snippet: string;
}

export interface AnalyticsAchievement {
  id: string;
  title: string;
  description: string | null;
  unlockedAt: string; // YYYY-MM-DD
}

export interface AnalyticsDashboard {
  /** The period the dashboard is scoped to. */
  period: Period;
  /** Requested anchor calendar day (YYYY-MM-DD) in the user's timezone. */
  date: string;
  /**
   * The user's actual today in their timezone.
   *
   * Separate from `date` because the two answer different questions: `date` is
   * which period was asked for, this is how much of it has actually happened. The
   * client needs it to label future days in the current week or month rather than
   * scoring them as failures.
   */
  today: string;
  range: {
    start: string;
    end: string;
    label: string;
    isCurrent: boolean;
  };
  /** `null` when no honest comparison exists for this period. */
  comparison: AnalyticsComparison | null;
  hero: {
    total: number | null;
    grade: string | null;
    core: number | null;
    growth: number | null;
    bonus: number | null;
    /** The one habit completion rate, identical in definition on every tab. */
    habitReliability: number | null;
  };
  tiles: {
    routine: { completed: number; total: number; completionRate: number } | null;
    habitCompletion: number | null;
    sleepMinutes: number | null;
    mood: number | null;
    focusMinutes: number | null;
  };
  habits: AnalyticsHabitPanel;
  chart1: AnalyticsChartData[];
  chart2: AnalyticsChartData[];
  routine: AnalyticsRoutineDetail;
  /** All-time by nature — the page labels it as such rather than implying the period. */
  streaks: AnalyticsStreakSnapshot;
  tierMix: AnalyticsTierMix[];
  focus: AnalyticsFocusSummary;
  timeAllocation: AnalyticsTimeAllocation;
  tasks: AnalyticsTaskQuadrant;
  projects: AnalyticsProjectProgress[];
  milestones: AnalyticsMilestoneHit[];
  moodPulse: AnalyticsMoodPulsePoint[];
  sleep: AnalyticsSleepSnapshot | null;
  nutrition: { entries: number; calories: number | null; daysLogged: number } | null;
  health: AnalyticsHealthMetric[];
  journal: AnalyticsJournalEntry[];
  achievements: AnalyticsAchievement[];
  aiInsight: AnalyticsInsight | null;
}
