import { heatLevel } from '@/components/dashboard-ui/tokens';
import { shiftCalendarDay } from '@/lib/dates';

/**
 * Layout maths for the Consistency card's two views.
 *
 * Pure and importable with no environment, which is the only reason it lives here
 * rather than beside the fetching hook. The previous shape — all of it inside a
 * `'use client'` module that imports the settings store — meant the grid geometry
 * could not be unit tested at all, and grid geometry is precisely the thing where
 * an off-by-one is invisible on screen until someone is looking at the wrong week.
 *
 * The invariant every function here protects:
 *
 * > **`null` is not zero.** `null` means "no stored score for that date" — the day
 * > was never scored. It is never rendered, counted or averaged as a zero.
 *
 * A `null` also means "this month has no such day" (February has no 30th), and
 * the two must look different or the card invents days.
 */

export interface ContributionDay {
  date: string;
  score: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  /**
   * Back-fill in the first column, aligning rows to weekdays.
   *
   * Not a day the user lived, so it is drawn as empty space rather than as an
   * unscored day.
   *
   * Optional on the wire type because it is DERIVED, not fetched — the API sends
   * `{ date, totalScore }`. `buildYearView` is the single place that resolves it,
   * so a row can never reach the grid with `pad` undefined.
   */
  pad?: boolean;
  /** A real day of the rendered year that has not happened yet. Also derived. */
  future?: boolean;
}

export interface ContributionStats {
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  /** Weekday name, or `null` without enough evidence to claim a pattern. */
  bestWeekday: string | null;
  /** Days elapsed in the selected year, so "128 / 300" is honest in October. */
  totalDays: number;
}

export const DAY_NAMES = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
] as const;

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** 366 days back from today covers "the last year", crossing at most two calendar years. */
export const WINDOW_DAYS = 365;

/** Midnight UTC, so a calendar date's weekday is intrinsic. Never a local instant. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function isoWeekdayOf(date: string): number {
  const dow = weekdayOf(date);
  return dow === 0 ? 7 : dow;
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function toDay(date: string, score: number | null, today: string): ContributionDay {
  return {
    date,
    score,
    level: heatLevel(score),
    pad: date.startsWith('pad-'),
    future: !date.startsWith('pad-') && date > today,
  };
}

const padDay = (date: string, i: number): ContributionDay => ({
  date: `pad-${date}-${i}`,
  score: null,
  level: 0,
  pad: true,
  future: false,
});

// ---------------------------------------------------------------------------
// View 1: the GitHub contribution graph
// ---------------------------------------------------------------------------

export interface YearViewModel {
  /**
   * Columns of 7, oldest first, weekday-aligned.
   *
   * Always the FULL year — 52 or 53 columns — whether or not there is any data.
   */
  weeks: ContributionDay[][];
  /**
   * Keys of the back-fill cells in the first column. Back-filled so the rows
   * ARE weekdays, which is what makes GitHub's graph readable — but a back-fill
   * cell is not a day, so it is invisible and unlabelled rather than drawn.
   */
  padding: Set<string>;
}

/**
 * One column per week, seven rows (Sun..Sat), for the WHOLE calendar year.
 *
 * ## Why the range is the year and not the data
 *
 * This previously spanned `dates[0] .. dates[dates.length - 1]` — the first and
 * last keys actually present in the map. That is the single cause of "one green
 * square floating in a huge black rectangle": a user with one logged day got a
 * one-week grid, and the card rendered its full height and width around a grid
 * one-fifty-seventh of the size it should have been. No amount of CSS can fix a
 * model that emits four cells when it promised three hundred and sixty-five, and
 * every "empty dark space" report since was a symptom of this one line.
 *
 * The calendar is the point. A day with no reading is a *skeleton cell*, not a
 * gap — so the shape of the year is legible before the user has logged anything,
 * and a single active day reads as one lit cell in a calendar rather than as the
 * entire extent of their activity.
 */
export function buildYearView(
  byDate: ReadonlyMap<string, ContributionDay>,
  year: number,
  today: string
): YearViewModel {
  const weeks: ContributionDay[][] = [];
  const padding = new Set<string>();
  let current: ContributionDay[] = [];

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  for (let date = start; date <= end; date = shiftCalendarDay(date, 1)) {
    if (current.length === 0 && date === start) {
      for (let i = 0; i < weekdayOf(date); i++) {
        const cell = padDay(date, i);
        padding.add(cell.date);
        current.push(cell);
      }
    }
    /*
      Normalise rather than pass the fetched row straight through: the wire type
      carries only `{ date, score, level }`, so `pad` and `future` are resolved
      here, in the one place that knows what year and what day it is today. A day
      that exists in the map but is past `today` still has to be marked future.
    */
    const stored = byDate.get(date);
    current.push(
      stored === undefined
        ? toDay(date, null, today)
        : { ...stored, pad: false, future: date > today }
    );
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) weeks.push(current);

  return { weeks, padding };
}

// ---------------------------------------------------------------------------
// View 2: the LeetCode streak calendar
// ---------------------------------------------------------------------------

export interface MonthBlock {
  month: number;
  /** `YYYY-MM` */
  key: string;
  /**
   * Seven rows by N columns. A `null` cell is a genuine gap: the month has no such
   * day (February, the 29th of a non-leap year) or the date is outside the loaded
   * window. Both must render as nothing at all.
   */
  grid: (ContributionDay | null)[][];
  activeDays: number;
  daysInMonth: number;
}

/**
 * One block per calendar month, day 1 placed in the row for its own weekday and
 * the grid filling rightward, so a month reads as a calendar rather than as a
 * compressed strip.
 *
 * Columns are `ceil((leadingBlanks + daysInMonth) / 7)`, which is why a 31-day
 * month needs six columns and February needs four or five.
 */
export function buildMonthView(
  byDate: ReadonlyMap<string, ContributionDay>,
  year: number,
  today: string
): { months: MonthBlock[] } {
  const months: MonthBlock[] = [];

  for (let month = 1; month <= 12; month++) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const leadingBlanks = isoWeekdayOf(`${prefix}-01`) - 1;

    const columns = Math.ceil((leadingBlanks + daysInMonth) / 7);
    const grid: (ContributionDay | null)[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: columns }, () => null)
    );

    let activeDays = 0;
    for (let i = 0; i < daysInMonth; i++) {
      const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
      const found = byDate.get(date);
      const day =
        found === undefined
          ? toDay(date, null, today)
          : { ...found, pad: false, future: date > today };
      if (day.score !== null) activeDays += 1;

      const slot = leadingBlanks + i;
      const row = slot % 7;
      const col = Math.floor(slot / 7);
      const line = grid[row];
      if (line) line[col] = day;
    }

    months.push({ month, key: prefix, grid, activeDays, daysInMonth });
  }

  return { months };
}

// ---------------------------------------------------------------------------
// Stats, shared by both views
// ---------------------------------------------------------------------------

/**
 * The header numbers, derived from the same rows the grid paints.
 *
 * Deliberately not read from `GET /api/streak`: a header reading "current streak
 * 9" above a calendar with a visible gap in it is exactly the small contradiction
 * that makes a dashboard untrustworthy. Same source, same window, always.
 *
 * `currentStreak` ends on the most recent scored day rather than requiring today
 * specifically. A run that ended yesterday is still a run; it simply is not
 * *current* today, and the grid shows the gap on its own, so the number does not
 * also have to encode whether the user has logged yet.
 */
export function computeStats(
  byDate: ReadonlyMap<string, ContributionDay>,
  year: number,
  today: string
): ContributionStats {
  const dates = Array.from(byDate.values())
    .filter((d) => yearOf(d.date) === year && d.score !== null)
    .map((d) => d.date)
    .sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous !== null && shiftCalendarDay(previous, 1) === date ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  /*
    Current streak: consecutive scored days ending on the most recent one.

    The guard has to test for BOTH "absent from the map" and "present with a null
    score". `byDate.get(cursor)?.score !== null` is not enough: optional chaining
    yields `undefined` for a date that is not in the map, and `undefined !== null`
    is true, so the loop walked backwards off the end of the dataset forever. The
    dense map made that failure easy to hit - most dates in the window are gaps.
  */
  let current = 0;
  let cursor: string | null = previous;
  while (cursor !== null) {
    const score = byDate.get(cursor)?.score;
    if (score === null || score === undefined) break;
    current += 1;
    cursor = shiftCalendarDay(cursor, -1);
  }

  /*
    Best weekday, counting only days that actually have a score. Averaging across
    all days would always name the weekend, because a weekday is far more likely
    to have a row at all - an artefact of the data, not a fact about the user.
  */
  const totals = new Map<number, { sum: number; n: number }>();
  for (const day of byDate.values()) {
    if (day.score === null || yearOf(day.date) !== year) continue;
    const bucket = totals.get(weekdayOf(day.date)) ?? { sum: 0, n: 0 };
    bucket.sum += day.score;
    bucket.n += 1;
    totals.set(weekdayOf(day.date), bucket);
  }
  const ranked = Array.from(totals.entries())
    .map(([dow, b]) => ({ dow, avg: b.sum / b.n, n: b.n }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
  const top = ranked[0];
  const bestWeekday = top && top.n >= 3 ? (DAY_NAMES[top.dow] ?? null) : null;

  // Days elapsed in the year up to and including today, so the denominator never
  // implies a full year in October.
  const todayYear = yearOf(today);
  const totalDays =
    todayYear > year
      ? 365
      : todayYear < year
        ? 0
        : Math.ceil(
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) /
              86_400_000
          ) + 1;

  return { activeDays: dates.length, longestStreak: longest, currentStreak: current, bestWeekday, totalDays };
}

/** Calendar years present in the loaded window, newest first. */
export function yearsInWindow(
  byDate: ReadonlyMap<string, ContributionDay>
): number[] {
  if (byDate.size === 0) return [];
  return Array.from(new Set(Array.from(byDate.keys()).map(yearOf))).sort((a, b) => b - a);
}
