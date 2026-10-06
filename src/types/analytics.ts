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
 * The preceding equivalent period, for the headline comparison.
 *
 * Present for every period, not just day and week. It used to be `null` for month
 * and year because comparing a part-lived month against a whole one produces a
 * flattering number; the window is now clipped to the elapsed days instead, and
 * `basis` says that is what happened.
 */
export interface AnalyticsComparison {
  start: string;
  end: string;
  /** `null` when the earlier window has no scored day. */
  average: number | null;
  delta: number | null;
  /**
   * The earlier window's habit completion rate, on the same definition as the hero.
   *
   * Present so the Trend Strip and the habit comparison read one figure rather than
   * deriving a second one from a habit read the comparison window did not perform.
   */
  habitRateAverage: number | null;
  /**
   * Exactly what was compared, in words.
   *
   * Always populated, including when `delta` is `null` — where it carries the reason
   * rather than a claim. Derived from the same values the arithmetic used, so it
   * cannot drift into describing a window the numbers did not come from.
   */
  basis: string;
  /** True when the earlier window was cut short to match elapsed days. */
  clipped: boolean;
  /** Days of the current period the comparison covers. */
  comparedDays: number;
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
  /**
   * The duration target `metTarget` was measured against, in minutes.
   *
   * Resolved server-side from `UserSettings.minSleepDuration`, falling back to the app
   * default. Sent so the card can state the number it judged against rather than
   * hard-coding one and hoping it matches.
   */
  targetMinutes: number;
  /**
   * Whether that target is the user's own or the application's default.
   *
   * Present because "8 hours" is two different claims: a number someone chose, and a
   * number nobody did. Without this the card must pick one wording and be wrong half the
   * time.
   */
  targetSource: 'user' | 'app-default';
  /** The user's configured bedtime and wake time, when set. */
  targetBedtime: string | null;
  targetWakeTime: string | null;
  /** Roll-up of every logged night in the selected period. */
  periodStats: {
    loggedDays: number;
    averageDurationMinutes: number | null;
  } | null;
}

/**
 * A ranked finding about the period: what changed, and the numbers behind it.
 *
 * Named `AnalyticsHighlight` rather than `AnalyticsInsight`, which is already the AI
 * callout's type at the bottom of this file. The two are unrelated — one is a
 * rule-based finding computed from habit and score data, the other is a stored model
 * output — and reusing the name would have made the payload ambiguous at every call
 * site.
 */
export type AnalyticsHighlightCategory = 'mover' | 'day' | 'streak' | 'slipping';

export interface AnalyticsHighlight {
  /** Stable across renders, so a device-side mute preference can key on it. */
  id: string;
  category: AnalyticsHighlightCategory;
  /** The finding, with its number in the sentence. */
  headline: string;
  /** The figures behind it, and the window they came from. */
  evidence: string;
  /** The minimum-data check that had to pass, stated so the claim is auditable. */
  basis: string;
  severity: 'positive' | 'negative' | 'neutral';
  href: string | null;
  hrefLabel: string | null;
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
  /**
   * The calendar day this point covers, when it covers exactly one.
   *
   * Added for drill-down: a bar is a link only if the page knows what the bar *is*.
   * `null` for a tier or a day-outcome bucket, which have no single date.
   */
  date?: string | null;
  /**
   * Where this point leads.
   *
   * Decided server-side, because the server is what knows a bar is habit `abc123`
   * rather than a month — and a client guessing would have to re-derive that mapping
   * for every chart, which is where two surfaces end up disagreeing.
   */
  href?: string | null;
}

/**
 * Why a given day's score is what it is.
 *
 * Present so a low bar can be *explained*. A rest day is meant to score low, so
 * annotating it is the difference between "your worst day" and "your rest day" — and
 * the second is not a failure.
 */
export interface AnalyticsDayAnnotation {
  date: string;
  /** A day the user planned to take off. Low scores are expected, not a miss. */
  isRestDay: boolean;
  /** A reduced-load day: fewer habits were due than usual. */
  isMinimumDay: boolean;
  score: number | null;
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
    /**
     * The weekday this range's week began on, `0` being Sunday.
     *
     * Sent so the client can navigate by the same week boundaries the server used
     * instead of re-deriving them from a setting it may not have loaded yet. The
     * settings store is populated on sign-in, but the first `getPeriodRange` call
     * can beat it — and a client guessing Monday would step to a visibly wrong
     * anchor for a Sunday-start user.
     */
    weekStartsOn: number;
  };
  /**
   * The comparison, for every period.
   *
   * Non-null by contract: `basis` always explains what was compared, so "no
   * comparison" is a sentence rather than a missing object.
   */
  comparison: AnalyticsComparison;
  /**
   * How complete the period's scores are.
   *
   * Scores come from a bounded nightly job, so a period can hold days nobody has
   * computed yet. The page says so rather than presenting a partial average as
   * the period's result.
   */
  freshness: {
    /** Newest day this user has a score for, anywhere in their history. */
    latestScoredDate: string | null;
    /** Days in the range that have already happened. */
    elapsedDays: number;
    /** Elapsed days in the range carrying no score. */
    unscoredDays: number;
  };
  hero: {
    total: number | null;
    grade: string | null;
    core: number | null;
    growth: number | null;
    bonus: number | null;
    /** Real scored-day count; the average is over these days and no others. */
    daysScored: number;
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
  /**
   * Up to three ranked findings about the period, each with the numbers behind it.
   *
   * Empty when nothing clears its threshold, which is the correct output for a sparse
   * period — never a placeholder. Muted categories are filtered on the device, so the
   * server always sends the full ranked set.
   */
  insights: AnalyticsHighlight[];
  chart1: AnalyticsChartData[];
  chart2: AnalyticsChartData[];
  /**
   * Per-day annotations for the period, keyed by `YYYY-MM-DD`.
   *
   * Covers rest days and reduced-load days only. Day *type* is deliberately absent:
   * resolving it needs the day-type definitions and routine exceptions, which this
   * endpoint does not read, and a guessed day type would be worse than none.
   *
   * Empty when the period has no scored days, rather than absent — so a consumer can
   * tell "nothing to annotate" from "older server".
   */
  annotations: Record<string, AnalyticsDayAnnotation>;
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
