/**
 * Timeframe and run semantics for achievement criteria.
 *
 * Pure date-set helpers. No DB access, no imports that reach `@/lib/prisma`, so
 * the whole rule set is testable in isolation.
 *
 * ## Why this module exists
 *
 * `AchievementCriteria.timeframe` used to be decorative: `checkCriteria` read
 * `field`, `operator` and `value` and never looked at `timeframe`. Every
 * criterion therefore evaluated against a lifetime aggregate, so "Perfect Week"
 * (`perfectDays >= 7`, `timeframe: 'WEEK'`) unlocked on seven scattered perfect
 * days accumulated over two years, and "Consistency King" unlocked on four
 * perfect weeks that were never adjacent.
 *
 * The vocabulary is deliberately narrow, because each word has to be *measurable*
 * from a set of date strings and nothing else:
 *
 * | timeframe | window                                  |
 * | --------- | --------------------------------------- |
 * | `DAY`     | the user's current calendar day         |
 * | `WEEK`    | the 7 days ending today                 |
 * | `MONTH`   | the 30 days ending today                |
 * | `YEAR`    | the 365 days ending today               |
 * | `ALL_TIME`| unbounded; the value is used as-is      |
 *
 * Windows are **trailing**, not calendar-aligned. A calendar-aligned week means
 * "Perfect Week" is unreachable until Sunday, and a calendar-aligned month means
 * "Perfect Month" is unreachable until the 31st: an achievement nobody can earn
 * is worse than an imprecise one. Trailing windows are also what "the last 7 days
 * were perfect" means to a person.
 *
 * ## Consecutive runs
 *
 * A *count* inside a trailing window is a moving target: the moment a day is
 * missed, the count drops and an achievement that was one check away from firing
 * never will. So run-shaped criteria ("7 consecutive perfect days") resolve
 * against **monotonic best-ever runs**, computed here and supplied as lifetime
 * totals by the service. `calculateCurrentStreak` in the streak domain is the
 * wrong tool for that: it deliberately treats "today not yet logged" as
 * non-breaking, which is correct for a *current* streak and wrong for a lifetime
 * best.
 */

import { toZonedTime } from 'date-fns-tz';
import type { AchievementCriteria } from '@/lib/constants/achievements';

export type AchievementTimeframe = NonNullable<AchievementCriteria['timeframe']>;

const MS_PER_DAY = 86_400_000;

/** Length of each window in days. `ALL_TIME` is unbounded. */
export const TIMEFRAME_DAYS: Readonly<Record<AchievementTimeframe, number | null>> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
  ALL_TIME: null,
};

/**
 * True when the timeframe restricts the measurement to a trailing window.
 *
 * A type predicate, not a plain `boolean`: it excludes both `undefined` and
 * `ALL_TIME`, which is what lets a caller index `TIMEFRAME_DAYS[timeframe]`
 * without re-proving the value is present.
 */
export function isWindowedTimeframe(
  timeframe: AchievementTimeframe | undefined
): timeframe is Exclude<AchievementTimeframe, 'ALL_TIME'> {
  if (timeframe === undefined) return false;
  return TIMEFRAME_DAYS[timeframe] !== null;
}

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Shift a `YYYY-MM-DD` date by whole days. */
export function shiftDate(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Distinct dates, ascending. */
function normalizeDates(dates: readonly string[]): string[] {
  return [...new Set(dates)].sort((a, b) => toUtcMs(a) - toUtcMs(b));
}

/**
 * How many of `dates` fall inside the trailing window for `timeframe`.
 *
 * `ALL_TIME` (and an absent timeframe) counts everything. An unknown `today`
 * cannot place a window, so it degrades to the all-time count rather than
 * silently dropping every event — the caller decides whether that is honest.
 *
 * @example
 * countDatesWithinTimeframe(['2026-09-01', '2026-09-10'], '2026-09-10', 'WEEK') // => 2
 */
export function countDatesWithinTimeframe(
  dates: readonly string[],
  today: string | undefined,
  timeframe: AchievementTimeframe | undefined
): number {
  if (!isWindowedTimeframe(timeframe) || today === undefined) return normalizeDates(dates).length;
  // No `?? 0`: coalescing first would turn the `ALL_TIME` sentinel (`null`) into
  // `0`, making the guard below dead code and computing a one-day window.
  const days = TIMEFRAME_DAYS[timeframe];
  if (days === null || days === undefined) return normalizeDates(dates).length;
  const start = shiftDate(today, -(days - 1));
  return normalizeDates(dates).filter((date) => date >= start && date <= today).length;
}

/**
 * Length of the longest run of consecutive calendar days in `dates`.
 *
 * Monotonic: it never decreases as history grows, which is what makes it safe to
 * unlock an achievement against.
 *
 * @example
 * longestConsecutiveRun(['2026-09-01', '2026-09-02', '2026-09-04']) // => 2
 */
export function longestConsecutiveRun(dates: readonly string[]): number {
  const sorted = normalizeDates(dates);
  if (sorted.length === 0) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    // `noUncheckedIndexedAccess` widens these to `string | undefined`. Both are
    // in range by construction (`i < length`), but the loop body only runs when
    // both are present, so skipping an incomplete pair is correct rather than a
    // silent truncation.
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous === undefined || current === undefined) continue;
    if (calendarDaysBetween(previous, current) === 1) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * Length of the run of consecutive days ending at `today` or `today - 1`.
 *
 * A day that has not happened yet (or has not been logged yet) must not break
 * the run, so an unrecorded `today` falls back to yesterday's run. Any earlier
 * gap does break it.
 *
 * @example
 * currentConsecutiveRun(['2026-09-08', '2026-09-09'], '2026-09-10') // => 2
 */
export function currentConsecutiveRun(
  dates: readonly string[],
  today: string
): number {
  const set = new Set(normalizeDates(dates));
  let cursor = set.has(today) ? today : shiftDate(today, -1);
  let run = 0;
  while (set.has(cursor)) {
    run += 1;
    cursor = shiftDate(cursor, -1);
  }
  return run;
}

/** Monday-anchored start of the calendar week containing `date`. */
export function weekStart(date: string): string {
  const parsed = new Date(toUtcMs(date));
  const isoDay = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
  return shiftDate(date, -(isoDay - 1));
}

/**
 * Calendar weeks that contain every one of their seven days in `dates`.
 *
 * A partial week at either end of the range can never be perfect, so it is
 * simply absent from the result — the count is "complete perfect weeks", which
 * is what "7 consecutive perfect days" in a week means.
 */
export function countPerfectWeeks(dates: readonly string[]): number {
  return perfectWeekStarts(dates).size;
}

/** Monday-anchored start dates of the weeks that were perfect in `dates`. */
export function perfectWeekStarts(dates: readonly string[]): Set<string> {
  const daysByWeek = new Map<string, Set<string>>();
  for (const date of normalizeDates(dates)) {
    const start = weekStart(date);
    const bucket = daysByWeek.get(start);
    if (bucket) bucket.add(date);
    else daysByWeek.set(start, new Set([date]));
  }
  const perfect = new Set<string>();
  for (const [start, days] of daysByWeek) {
    if (days.size === 7) perfect.add(start);
  }
  return perfect;
}

/**
 * Longest run of *consecutive* perfect weeks.
 *
 * Distinct from `countPerfectWeeks`: four perfect weeks in a row is a different
 * claim from four perfect weeks anywhere in two years, and only this one is what
 * "Record 4 perfect weeks in a row" promises.
 */
export function longestPerfectWeekStreak(dates: readonly string[]): number {
  return longestConsecutiveRun([...perfectWeekStarts(dates)]);
}

// ============================================================================
// Local clock hours
// ============================================================================

/** First local hour counted as "late evening" for the Night Owl criterion. */
export const LATE_EVENING_START_HOUR = 20;

/**
 * Whether an instant falls in the user's local late-evening window.
 *
 * `startedAt` is stored as UTC, so the hour has to be read in the *user's* zone.
 * A fixed `T20:00:00.000Z` boundary is the bug this replaces: for a user in
 * `Asia/Tokyo` 20:00 UTC is 05:00 the next morning local, so the count described
 * a completely different part of their day.
 *
 * @example
 * isLateEvening(new Date('2026-09-10T12:00:00Z'), 'UTC')       // => false (12:00 local)
 * isLateEvening(new Date('2026-09-10T12:00:00Z'), 'Asia/Tokyo') // => true  (21:00 local)
 */
export function isLateEvening(
  instant: Date,
  timezone: string,
  fromHour: number = LATE_EVENING_START_HOUR
): boolean {
  return toZonedTime(instant, timezone).getHours() >= fromHour;
}
