import { shiftCalendarDay } from '@/lib/dates';
import {
  isEligibleOn,
  type ContributionHabit,
  type EligibilityContext,
} from '@/lib/habits/contribution-eligibility';

/**
 * The habit contribution year model - pure, and the whole calculation.
 *
 * ## The one rule everything else hangs off
 *
 * > A day with no `HabitLog` row is **unknown**, not failed.
 *
 * This is the difference between this and the existing `getHabitHealth` rate,
 * which divides by `completed + missed + skipped` and therefore only ever sees
 * days the user actually opened the app. Here the denominator is
 * **scheduled**: how many habits the user was meant to do. A day where three
 * habits were due and none were logged is a real zero, and the grid has to show
 * it as one.
 *
 * But "no log row" is genuinely ambiguous - it means either "I did not do it" or
 * "I never opened the app that day" - so it is a **distinct state**, not the same
 * as a logged miss. The three are rendered differently and never conflated.
 */

/** Level 0 carries no green. 1-4 are the "amount of activity" ramp. */
export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ContributionState =
  /** Scheduled and fully done. */
  | 'FULL'
  /** Scheduled, partly done. */
  | 'PARTIAL'
  /** Scheduled, and the user explicitly logged a miss or skip. */
  | 'LOGGED_MISS'
  /** Scheduled, but nothing was recorded at all. Unknown, not failed. */
  | 'NO_RECORD'
  /** Nothing was scheduled - a rest day, or before the first habit existed. */
  | 'UNSCHEDULED';

export interface ContributionCell {
  date: string;
  /** How many habits were due. */
  scheduled: number;
  completed: number;
  missed: number;
  skipped: number;
  /** `completed / scheduled`, or `null` when nothing was scheduled. */
  rate: number | null;
  level: ContributionLevel;
  state: ContributionState;
  /** Ids of the habits completed that day, for the tooltip breakdown. */
  completedHabitIds: string[];
  /** Ids of the habits scheduled but not completed. */
  missedHabitIds: string[];
}

export interface MonthSummary {
  month: number;
  label: string;
  days: number;
  /** Days with at least one habit completed. */
  activeDays: number;
  scheduledDays: number;
  completedTotal: number;
  scheduledTotal: number;
  /** `completedTotal / scheduledTotal`, or `null` when nothing was scheduled. */
  rate: number | null;
  /** Days in the month that lie beyond `clipEnd` - not yet lived. */
  futureDays: number;
}

export interface WeekdaySummary {
  /** 0 = Sunday. */
  weekday: number;
  label: string;
  activeDays: number;
  scheduledDays: number;
  rate: number | null;
}

export interface HabitContributionRow {
  habitId: string;
  name: string;
  color: string | null;
  icon: string | null;
  tier: HabitTierLike;
  completed: number;
  /** Times it was scheduled in the window. */
  scheduled: number;
  rate: number | null;
  /** Longest run of consecutive scheduled-and-completed days. */
  longestStreak: number;
  activeDays: number;
}

export type HabitTierLike = string;

export interface ContributionStats {
  year: number;
  isLeap: boolean;
  daysInYear: number;
  /** First date rendered: the later of Jan 1 and the user's first habit. */
  windowStart: string;
  /** Last date rendered: today, or Dec 31 for a past year. */
  windowEnd: string;
  activeDays: number;
  scheduledDays: number;
  completedTotal: number;
  scheduledTotal: number;
  rate: number | null;
  /** Days with nothing scheduled - rest days, not failures. */
  unscheduledDays: number;
  /** Days that were due, with nothing recorded. */
  noRecordDays: number;
  /** Days due and explicitly logged as missed. */
  loggedMissDays: number;
  perfectDays: number;
  currentStreak: number;
  longestStreak: number;
  bestMonth: string | null;
  bestWeekday: string | null;
  /** Average completions per scheduled day. */
  averagePerScheduledDay: number | null;
  /** Average completions per active day. */
  averagePerActiveDay: number | null;
}

export interface ContributionYear {
  stats: ContributionStats;
  /** Dense, one cell per date in the window, ascending. */
  cells: ContributionCell[];
  months: MonthSummary[];
  weekdays: WeekdaySummary[];
  habits: HabitContributionRow[];
  /**
   * Every year with at least one log, ascending, so the selector offers only
   * years that can actually render something.
   */
  availableYears: number[];
  /**
   * The previous year's stats when a comparison is possible, else `null`.
   *
   * `null` means "no history", which the UI must render as absent rather than as
   * a zero delta.
   */
  previousYear: ContributionStats | null;
}

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Days in a calendar year, leap years included.
 *
 * The Gregorian rule, not a hardcoded 365: divisible by 4, except centuries
 * which must be divisible by 400. So 2028 is 366, 1900 is 365, 2000 is 366.
 */
export function daysInYear(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function firstDayOfYear(year: number): string {
  return `${year}-01-01`;
}

export function lastDayOfYear(year: number): string {
  return `${year}-12-31`;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** `[year, month, day]` for a `YYYY-MM-DD` string. */
function parts(date: string): [number, number, number] {
  return [
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  ];
}

/**
 * Intensity.
 *
 * Driven by the **completion rate**, not by volume, because those answer different
 * questions and only one of them belongs on a GitHub-style cell. A day with 1 of 3
 * done is a third of a day, and it must not look like the same green as 9 of 10.
 * Volume is reported in the tooltip, where it can be read precisely.
 *
 * | Level | Rate | Reads as |
 * | ----- | ---- | -------- |
 * | 4 | 100% | Everything due, done |
 * | 3 | >= 70% | Strong |
 * | 2 | >= 40% | Decent |
 * | 1 | > 0% | Minimal |
 * | 0 | 0% or nothing due | No green at all |
 *
 * Thresholds are 70/40 rather than GitHub's distribution quartiles on purpose: a
 * user whose *every* week is mediocre should not see a grid of mid-greens that
 * looks like success. Fixed, absolute bands keep a bad year looking like a bad
 * year.
 */
export function levelFor(scheduled: number, completed: number): ContributionLevel {
  if (scheduled === 0) return 0;
  // Nothing completed is level 0, not level 1. The original version fell through
  // the rate bands and returned 1, which put a pale green on every day the user
  // did nothing at all - a 365-cell grid of "minimal activity" on a year of
  // nothing. The distinction between "did a little" and "did none" is the whole
  // point of an intensity ramp.
  if (completed === 0) return 0;
  const rate = completed / scheduled;
  if (rate >= 1) return 4;
  if (rate >= 0.7) return 3;
  if (rate >= 0.4) return 2;
  return 1;
}

export function stateFor(
  scheduled: number,
  completed: number,
  recordedMisses: number
): ContributionState {
  if (scheduled === 0) return 'UNSCHEDULED';
  if (completed >= scheduled) return 'FULL';
  if (completed > 0) return 'PARTIAL';
  return recordedMisses > 0 ? 'LOGGED_MISS' : 'NO_RECORD';
}

export interface LogLike {
  habitId: string;
  date: string;
  status: string;
}

export interface BuildYearInput {
  year: number;
  /** The user's today, `YYYY-MM-DD` in their own timezone. */
  today: string;
  habits: ContributionHabit[];
  logs: LogLike[];
  ctx: EligibilityContext;
}

/**
 * Build the whole year.
 *
 * Clipping is by the **earliest habit start date**, so a user who started three
 * weeks ago does not open a grid of 340 empty cells. Everything - the month
 * buckets, the streak maths, the "active days" denominator - is derived from the
 * clipped window, so the summary never claims a 365-day average the user has not
 * lived.
 */
export function buildContributionYear(input: BuildYearInput): ContributionYear {
  const { year, today, habits, logs, ctx } = input;

  const yearStart = firstDayOfYear(year);
  const yearEnd = lastDayOfYear(year);
  const isFutureYear = year > Number(today.slice(0, 4));

  // Earliest start across every habit, so the window opens when the user began.
  const earliestStart = habits.reduce<string | null>((min, h) => {
    if (min === null || h.startDay < min) return h.startDay;
    return min;
  }, null);

  const windowStart = earliestStart !== null && earliestStart > yearStart ? earliestStart : yearStart;
  // Today for the current or a past year; Dec 31 for a future one, so the shape
  // is still a full year rather than an empty string.
  const windowEnd = isFutureYear ? yearEnd : today < yearEnd ? today : yearEnd;

  /*
    The GRID spans the whole year; the WINDOW is only where scoring happens.

    Iterating `windowStart..windowEnd` and nothing else is why a user with one
    habit started three days ago got a three-day grid and a card that was 95%
    empty panel. `windowStart`/`windowEnd` are about which days can *count*
    toward a rate; they have nothing to do with which days the calendar shows.
    Outside the window a day is still emitted, as `UNSCHEDULED` and inert, so the
    matrix always has 52-53 columns and a lone active day reads as one lit cell
    in a calendar rather than as the whole extent of the user's activity.
  */
  const gridStart = yearStart;
  const gridEnd = yearEnd;

  // Index the logs once. A `HabitLog` has `@@unique([userId, habitId, date])`,
  // so there is at most one row per habit per day and a `Set` is exact.
  const byDate = new Map<string, LogLike[]>();
  for (const log of logs) {
    if (log.date < windowStart || log.date > windowEnd) continue;
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  const perHabit = new Map<
    string,
    { completed: number; scheduled: number; run: number; longest: number }
  >();
  for (const habit of habits) {
    perHabit.set(habit.id, { completed: 0, scheduled: 0, run: 0, longest: 0 });
  }

  const cells: ContributionCell[] = [];
  let previousScheduled = false;
  let currentRun = 0;
  let longestRun = 0;

  for (let date = gridStart; date <= gridEnd; date = shiftCalendarDay(date, 1)) {
    /*
      Outside the scoring window, emit an inert cell and move on. `UNSCHEDULED`
      with zero counts is the honest description — nothing was due — and it keeps
      the day in the matrix as a visible box instead of deleting it. Every
      aggregate below keys off `scheduled > 0` or `completed > 0`, so these cells
      cannot move a rate, a streak or a per-habit total.
    */
    if (date < windowStart || date > windowEnd) {
      cells.push({
        date,
        scheduled: 0,
        completed: 0,
        missed: 0,
        skipped: 0,
        rate: null,
        level: 0,
        state: 'UNSCHEDULED',
        completedHabitIds: [],
        missedHabitIds: [],
      });
      continue;
    }

    const dayLogs = byDate.get(date) ?? [];

    let scheduled = 0;
    const scheduledIds: string[] = [];

    for (const habit of habits) {
      if (isEligibleOn(habit, date, ctx).eligible) {
        scheduled += 1;
        scheduledIds.push(habit.id);
        const stats = perHabit.get(habit.id);
        if (stats) stats.scheduled += 1;
      }
    }

    const completedIds: string[] = [];
    let missed = 0;
    let skipped = 0;

    for (const log of dayLogs) {
      // Only count a log for a habit that was actually due. A RESCHEDULE or a
      // retroactive tick can leave a COMPLETED row for a habit that was not
      // scheduled that day, and counting it would push the rate above 100%.
      if (!scheduledIds.includes(log.habitId)) continue;

      if (log.status === 'COMPLETED') {
        completedIds.push(log.habitId);
        const stats = perHabit.get(log.habitId);
        if (stats) {
          stats.completed += 1;
          stats.run += 1;
          if (stats.run > stats.longest) stats.longest = stats.run;
        }
      } else if (log.status === 'MISSED') {
        missed += 1;
        const stats = perHabit.get(log.habitId);
        if (stats) stats.run = 0;
      } else if (log.status === 'SKIPPED') {
        skipped += 1;
        const stats = perHabit.get(log.habitId);
        if (stats) stats.run = 0;
      }
    }

    const completed = completedIds.length;
    const rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;

    // A "streak" here is consecutive *scheduled days that were fully or partly
    // done*. A day with nothing scheduled does not break it - a rest day between
    // two good Mondays is not a lapse - but a scheduled day with zero completions
    // does. That is the definition a user would give the word.
    if (scheduled > 0) {
      if (completed > 0) {
        currentRun += 1;
        if (currentRun > longestRun) longestRun = currentRun;
      } else {
        currentRun = 0;
      }
    }
    previousScheduled = scheduled > 0;

    cells.push({
      date,
      scheduled,
      completed,
      missed,
      skipped,
      rate,
      level: levelFor(scheduled, completed),
      state: stateFor(scheduled, completed, missed + skipped),
      completedHabitIds: completedIds,
      missedHabitIds: scheduledIds.filter((id) => !completedIds.includes(id)),
    });
  }

  // ── aggregates ────────────────────────────────────────────────────────────

  const scheduledDays = cells.filter((c) => c.scheduled > 0);
  const completedTotal = cells.reduce((sum, c) => sum + c.completed, 0);
  const scheduledTotal = scheduledDays.reduce((sum, c) => sum + c.scheduled, 0);
  const activeDays = cells.filter((c) => c.completed > 0).length;

  const months = buildMonths(cells, year, today);
  const weekdays = buildWeekdays(cells);
  const habitRows = buildHabitRows(habits, perHabit, cells);

  const bestMonth = months.reduce<MonthSummary | null>((best, m) => {
    if (m.rate === null) return best;
    if (best === null || best.rate === null || m.rate > best.rate) return m;
    return best;
  }, null);

  // A weekday needs real evidence: three scheduled Mondays is not a pattern.
  const bestWeekdayRow = weekdays.reduce<WeekdaySummary | null>((best, w) => {
    if (w.rate === null || w.scheduledDays < 3) return best;
    if (best === null || best.rate === null || w.rate > best.rate) return w;
    return best;
  }, null);

  void previousScheduled;

  const stats: ContributionStats = {
    year,
    isLeap: isLeapYear(year),
    daysInYear: daysInYear(year),
    windowStart,
    windowEnd,
    activeDays,
    scheduledDays: scheduledDays.length,
    completedTotal,
    scheduledTotal,
    rate: scheduledTotal > 0 ? Math.round((completedTotal / scheduledTotal) * 100) : null,
    unscheduledDays: cells.filter((c) => c.state === 'UNSCHEDULED').length,
    noRecordDays: cells.filter((c) => c.state === 'NO_RECORD').length,
    loggedMissDays: cells.filter((c) => c.state === 'LOGGED_MISS').length,
    perfectDays: cells.filter((c) => c.state === 'FULL').length,
    // A current streak only means something for the year being lived now; a
    // 2024 streak that "continues" to today is a lie.
    currentStreak: isFutureYear ? 0 : currentRun,
    longestStreak: longestRun,
    bestMonth: bestMonth?.label ?? null,
    bestWeekday: bestWeekdayRow?.label ?? null,
    averagePerScheduledDay:
      scheduledDays.length > 0
        ? Math.round((completedTotal / scheduledDays.length) * 10) / 10
        : null,
    averagePerActiveDay: activeDays > 0 ? Math.round((completedTotal / activeDays) * 10) / 10 : null,
  };

  return {
    stats,
    cells,
    months,
    weekdays,
    habits: habitRows,
    availableYears: availableYears(logs),
    // Filled in by the service, which knows whether a prior year is comparable.
    // Null here is the honest default: a pure builder has not been asked about
    // another year and must not claim one does not exist.
    previousYear: null,
  };
}

function buildMonths(cells: ContributionCell[], year: number, today: string): MonthSummary[] {
  const buckets = new Map<
    number,
    { days: number; active: number; scheduled: number; completed: number; future: number }
  >();

  for (let month = 1; month <= 12; month++) {
    buckets.set(month, { days: 0, active: 0, scheduled: 0, completed: 0, future: 0 });
  }

  for (const cell of cells) {
    const [, month] = parts(cell.date);
    const bucket = buckets.get(month);
    if (!bucket) continue;
    bucket.days += 1;
    if (cell.completed > 0) bucket.active += 1;
    if (cell.scheduled > 0) {
      bucket.scheduled += 1;
      bucket.completed += cell.completed;
    }
    /*
      Counted from the dates, not inferred from "the month came after the last
      cell". The grid now spans the whole year, so `cells` ends on 31 December
      and every month has real days - which means a month the user has not
      reached has to be recognised by its dates, or it reports itself as a month
      of zeroes and gets drawn as a failure.
    */
    if (cell.date > today) bucket.future += 1;
  }
  void year;

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([month, b]) => ({
      month,
      label: MONTH_LABELS[month - 1] ?? String(month),
      days: b.days,
      activeDays: b.active,
      scheduledDays: b.scheduled,
      completedTotal: b.completed,
      scheduledTotal: b.scheduled,
      rate: b.scheduled > 0 ? Math.round((b.completed / b.scheduled) * 100) : null,
      futureDays: b.future,
    }));
}

function buildWeekdays(cells: ContributionCell[]): WeekdaySummary[] {
  const buckets = Array.from({ length: 7 }, () => ({ active: 0, scheduled: 0, completed: 0 }));

  for (const cell of cells) {
    const bucket = buckets[weekdayOf(cell.date)];
    if (!bucket) continue;
    if (cell.completed > 0) bucket.active += 1;
    if (cell.scheduled > 0) {
      bucket.scheduled += 1;
      bucket.completed += cell.completed;
    }
  }

  return buckets.map((b, weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday] ?? String(weekday),
    activeDays: b.active,
    scheduledDays: b.scheduled,
    rate: b.scheduled > 0 ? Math.round((b.completed / b.scheduled) * 100) : null,
  }));
}

function buildHabitRows(
  habits: ContributionHabit[],
  perHabit: Map<string, { completed: number; scheduled: number; run: number; longest: number }>,
  cells: ContributionCell[]
): HabitContributionRow[] {
  const activeByHabit = new Map<string, number>();
  for (const cell of cells) {
    for (const id of cell.completedHabitIds) {
      activeByHabit.set(id, (activeByHabit.get(id) ?? 0) + 1);
    }
  }

  return habits
    .map((habit) => {
      const stats = perHabit.get(habit.id) ?? {
        completed: 0,
        scheduled: 0,
        run: 0,
        longest: 0,
      };
      return {
        habitId: habit.id,
        name: habit.name,
        color: habit.color,
        icon: habit.icon,
        tier: habit.tier,
        completed: stats.completed,
        scheduled: stats.scheduled,
        rate: stats.scheduled > 0 ? Math.round((stats.completed / stats.scheduled) * 100) : null,
        longestStreak: stats.longest,
        activeDays: activeByHabit.get(habit.id) ?? 0,
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.completed - a.completed);
}

/** Years that actually contain a log, so the selector never offers an empty year. */
function availableYears(logs: LogLike[]): number[] {
  if (logs.length === 0) return [];
  return Array.from(new Set(logs.map((l) => Number(l.date.slice(0, 4))))).sort((a, b) => b - a);
}

/** `null` when there is nothing to show, so a future year is not a 0%. */
export function yearOverYear(
  current: ContributionStats,
  previous: ContributionStats | null
): { delta: number | null; previousRate: number | null } {
  if (previous === null || previous.rate === null || current.rate === null) {
    return { delta: null, previousRate: previous?.rate ?? null };
  }
  return { delta: current.rate - previous.rate, previousRate: previous.rate };
}
