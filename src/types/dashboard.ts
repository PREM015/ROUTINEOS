/**
 * `/dashboard` overview contract.
 *
 * The dashboard was previously nine independent client fetches, which is how the
 * same page ended up polling `/api/routine/today` and `/api/habits/today` twice
 * each (audit F15) and computing one number two different ways. Every
 * trend-shaped widget now reads from the single `days` array below.
 *
 * ## Why one endpoint
 *
 * Momentum (trend + weekly composition), Weekly Recap, Weekly Routine Adherence
 * and three of the five Life Balance radar axes are all functions of the same
 * trailing window of `DailyScore` rows. Serving them as one payload means the
 * dashboard makes one request, the arithmetic cannot disagree between cards, and
 * a failure is one contained error rather than six.
 *
 * ## `null` is load-bearing
 *
 * `null` never means zero. A `DailyScore` row with `totalScore: null` is a day
 * that was never scored, and averaging it as `0` would draw a cliff for a day the
 * user simply had no data for. Every consumer here treats `null` as a gap, and
 * the widgets gate on `scoredDays` before rendering a chart shape.
 */

/**
 * The six life-balance axes, in reading order.
 *
 * Six and not five because a five-spoke web puts two axes directly opposite each
 * other on a flat top (`habits` over `goals`), which reads as one axis rather than
 * two. An even count has no opposing pair, and a hexagon is the natural grid for
 * it.
 */
export const DASHBOARD_RADAR_KEYS = [
  'habits',
  'routine',
  'sleep',
  'goals',
  'focus',
  'reflections',
] as const;

export type DashboardRadarKey = (typeof DASHBOARD_RADAR_KEYS)[number];

/** One calendar day inside the trailing window. */
export interface DashboardDay {
  date: string;
  totalScore: number | null;
  habitCompletionRate: number | null;
  routineCompletionRate: number | null;
  sleepScore: number | null;
}

export interface DashboardDayTypeBucket {
  /**
   * The user's own display name for the day type ("College", "Exam Day"), not
   * the `DayType` enum. The brief's examples are all custom names, so the enum
   * would render every user with the same two bars.
   */
  dayTypeName: string;
  averageScore: number;
  /**
   * Scored days behind `averageScore`. The widget refuses to draw a bar below
   * `DAY_TYPE_MIN_SCORED_DAYS` rather than showing a misleading short one.
   */
  scoredDays: number;
}

export interface DashboardRadarAxis {
  key: DashboardRadarKey;
  label: string;
  /** 0-100, or `null` when this axis has no data in the window. */
  value: number | null;
  /** The destination page that owns acting on this axis. */
  href: string;
}

export interface DashboardRadar {
  axes: DashboardRadarAxis[];
  /** Scored days in the trailing window. Below `RADAR_MIN_DAYS` nothing renders. */
  daysWithData: number;
}

export interface DashboardGoalsSummary {
  active: number;
  onPace: number;
  /** The same on-pace count computed as if `today` were 7 days earlier. */
  previousOnPace: number;
  furthestBehind: {
    id: string;
    title: string;
    /** Percentage points below the linear pace line. Always positive. */
    behindPctPoints: number;
  } | null;
}

export interface DashboardRoutineMiss {
  blockTitle: string;
  /** Days in the trailing window where this block was logged MISSED. */
  misses: number;
}

export interface DashboardFocusSummary {
  totalMinutes: number;
  sessions: number;
}

export interface DashboardOverview {
  today: string;
  timezone: string;
  /**
   * Dense and ascending, `windowDays` long, ending today. A day with no stored
   * `DailyScore` row is present with all-`null` metrics rather than absent, so
   * every widget can position it correctly in time.
   */
  days: DashboardDay[];
  windowDays: number;
  streak: {
    current: number;
    longest: number;
    lastCompletedDate: string | null;
  };
  dayTypes: DashboardDayTypeBucket[];
  radar: DashboardRadar;
  goals: DashboardGoalsSummary;
  routineMisses: DashboardRoutineMiss[];
  focus: DashboardFocusSummary;
}
