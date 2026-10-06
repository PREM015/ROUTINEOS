/**
 * Shared period-range utilities for RoutineOS.
 *
 * Used by the Recap page, the dashboard Routine Progress widget and any other
 * surface that needs Day / Week / Month / Year navigation. Every range is
 * computed against the user's timezone, and **weeks start on the day the user
 * chose in Settings** (`UserSettings.weekStartsOn`), so no two surfaces can
 * disagree about a boundary.
 *
 * All calendar math runs on the user's "wall clock" (obtained via
 * `toZonedTime`), which keeps boundaries correct even when the host machine's
 * local timezone differs from the user's timezone.
 *
 * Weeks used to be pinned to Monday here, unconditionally, while the setting
 * existed and was writable. A Sunday-start user got the wrong week on /analytics,
 * /recap and /reports simultaneously, with nothing on any of them to indicate it.
 */

import {
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
} from 'date-fns';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { DEFAULT_TZ, getTodayString } from './dates';

export type Period = 'day' | 'week' | 'month' | 'year';

/**
 * Which weekday a week begins on, as `Date.getDay()` numbers: 0 is Sunday.
 *
 * Seven values rather than `0 | 1`, because that is what the rest of the system
 * already permits. `UserSettings.weekStartsOn` is `Int @default(1)` with no CHECK
 * constraint, and `updateSettingsSchema` accepts `0..6` — so a stored `3` is a
 * legitimate value, not corruption. Typing this as `0 | 1` would make the type
 * disagree with both the database and the settings form, and the mismatch would
 * surface as an impossible-looking cast at the first non-Monday/Sunday account.
 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Monday, matching `UserSettings.weekStartsOn`'s database default and
 * `APP_CONFIG.defaults`.
 *
 * Used wherever the setting is unavailable — a signed-out shell, a row that
 * predates the column, a caller that has not loaded settings yet.
 */
export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

/**
 * Coerce a stored or user-supplied value into a usable weekday.
 *
 * Falls back to Monday for anything that is not an integer `0..6`. The column has
 * no CHECK constraint, and seeds, CSV import and admin edits all write without
 * passing through the settings Zod schema — so `getPeriodRange` cannot assume the
 * value is sane. This matters more than a normal input check would suggest: an
 * out-of-range `weekStartsOn` does not throw. `date-fns` silently returns a range
 * that is empty, or eight days long, and the page renders it as a real week.
 */
export function resolveWeekStartsOn(value: number | null | undefined): WeekStartsOn {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as WeekStartsOn)
    : DEFAULT_WEEK_STARTS_ON;
}

export interface PeriodBucket {
  /** Inclusive start date (YYYY-MM-DD) in the user's timezone. */
  start: string;
  /** Inclusive end date (YYYY-MM-DD) in the user's timezone. */
  end: string;
  /** Stable key (a date or a YYYY-MM month key). */
  key: string;
  /** Short display label. */
  label: string;
}

export interface PeriodRange {
  period: Period;
  anchorDate: string;
  /** Inclusive range start (YYYY-MM-DD). */
  start: string;
  /** Inclusive range end (YYYY-MM-DD). */
  end: string;
  /** Human label for the current range. */
  label: string;
  /** Anchor date (YYYY-MM-DD) for the previous period. */
  prev: string;
  /** Anchor date (YYYY-MM-DD) for the next period. */
  next: string;
  /** True when the range contains "today" in the user's timezone. */
  isCurrent: boolean;
  /**
   * The weekday this range's week began on.
   *
   * Carried on the result so a consumer holding a `PeriodRange` can keep working
   * in the same frame instead of re-deriving the setting. The weekly and monthly
   * modules both re-derive their week from an anchor, so a caller that resolved a
   * range one way and then passed a bare date to a module that guessed another
   * would report two different weeks from one anchor.
   */
  weekStartsOn: WeekStartsOn;
  /**
   * The zone this range was resolved in.
   *
   * Recorded for the same reason as `weekStartsOn`: it makes the result
   * self-describing, so resolving the neighbouring period from this one needs no
   * extra arguments and cannot silently use a different frame.
   */
  timezone: string;
  /** Sub-divisions of the range (days for week/month, months for year). */
  buckets: PeriodBucket[];
}

export const PERIOD_ORDER: Period[] = ['day', 'week', 'month', 'year'];

export const PERIOD_LABEL: Record<Period, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

/**
 * Parse a plain YYYY-MM-DD local date into an instant (the user's local
 * midnight). All further math maps cleanly back via the wall clock.
 */
function toLocalInstant(dateStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, tz);
}

/**
 * The user's wall clock for an instant — a Date whose fields read as the
 * local calendar in `tz` regardless of the host machine's timezone.
 */
function toWall(instant: Date, tz: string): Date {
  return toZonedTime(instant, tz);
}

function wallToDateStr(wall: Date): string {
  return format(wall, 'yyyy-MM-dd');
}

/**
 * Move an anchor by whole periods. Delta of -1 / +1 is the common case.
 */
export function shiftAnchor(date: string, period: Period, delta: number, tz = DEFAULT_TZ): string {
  const wall = toWall(toLocalInstant(date, tz), tz);
  if (period === 'day') return wallToDateStr(addDays(wall, delta));
  if (period === 'week') return wallToDateStr(addDays(wall, delta * 7));
  if (period === 'month') return wallToDateStr(addMonths(wall, delta));
  return wallToDateStr(addYears(wall, delta));
}

/**
 * Anchor date that resolves to the "current" period for the user's today.
 */
export function todayAnchor(tz = DEFAULT_TZ): string {
  return getTodayString(tz);
}

function formatLabel(start: string, end: string, period: Period, tz: string): string {
  const startInstant = toLocalInstant(start, tz);
  const endInstant = toLocalInstant(end, tz);
  if (period === 'day') return formatInTimeZone(startInstant, tz, 'EEE, MMM d');
  if (period === 'week') {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return formatInTimeZone(startInstant, tz, `MMM d`) + ' \u2013 ' + formatInTimeZone(endInstant, tz, sameYear ? 'MMM d' : 'MMM d, yyyy');
  }
  if (period === 'month') return formatInTimeZone(startInstant, tz, 'MMMM yyyy');
  return formatInTimeZone(startInstant, tz, 'yyyy');
}

/**
 * Compute the resolved range for a period anchored on a date.
 * Anchor dates are timezone-local calendar days.
 */
export function getPeriodRange(
  period: Period,
  anchorDate: string,
  tz = DEFAULT_TZ,
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON
): PeriodRange {
  const wall = toWall(toLocalInstant(anchorDate, tz), tz);
  let start: string;
  let end: string;
  let buckets: PeriodBucket[];
  let prev: string;
  let next: string;

  if (period === 'day') {
    start = anchorDate;
    end = anchorDate;
    prev = wallToDateStr(addDays(wall, -1));
    next = wallToDateStr(addDays(wall, 1));
    buckets = [
      {
        start: anchorDate,
        end: anchorDate,
        key: anchorDate,
        label: formatInTimeZone(toLocalInstant(anchorDate, tz), tz, 'EEE'),
      },
    ];
  } else if (period === 'week') {
    const weekStartWall = startOfWeek(wall, { weekStartsOn });
    const weekEndWall = endOfWeek(wall, { weekStartsOn });
    start = wallToDateStr(weekStartWall);
    end = wallToDateStr(weekEndWall);
    prev = wallToDateStr(addDays(weekStartWall, -7));
    next = wallToDateStr(addDays(weekStartWall, 7));
    buckets = eachDayOfInterval({ start: weekStartWall, end: weekEndWall }).map((day) => ({
      start: wallToDateStr(day),
      end: wallToDateStr(day),
      key: wallToDateStr(day),
      label: formatInTimeZone(toLocalInstant(wallToDateStr(day), tz), tz, 'EEE'),
    }));
  } else if (period === 'month') {
    const monthStartWall = startOfMonth(wall);
    const monthEndWall = endOfMonth(wall);
    start = wallToDateStr(monthStartWall);
    end = wallToDateStr(monthEndWall);
    prev = wallToDateStr(startOfMonth(addMonths(monthStartWall, -1)));
    next = wallToDateStr(startOfMonth(addMonths(monthStartWall, 1)));
    buckets = eachDayOfInterval({ start: monthStartWall, end: monthEndWall }).map((day) => ({
      start: wallToDateStr(day),
      end: wallToDateStr(day),
      key: wallToDateStr(day),
      label: formatInTimeZone(toLocalInstant(wallToDateStr(day), tz), tz, 'd'),
    }));
  } else {
    const year = Number(anchorDate.slice(0, 4));
    start = `${year}-01-01`;
    end = `${year}-12-31`;
    prev = `${year - 1}-01-01`;
    next = `${year + 1}-01-01`;
    buckets = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        start: `${year}-${String(month).padStart(2, '0')}-01`,
        end: `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
        key: `${year}-${String(month).padStart(2, '0')}`,
        label: formatInTimeZone(toLocalInstant(`${year}-${String(month).padStart(2, '0')}-15`, tz), tz, 'MMM'),
      };
    });
  }

  const today = getTodayString(tz);
  const isCurrent = start <= today && today <= end;

  return {
    period,
    anchorDate,
    start,
    end,
    label: formatLabel(start, end, period, tz),
    prev,
    next,
    isCurrent,
    buckets,
    weekStartsOn,
    timezone: tz,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whether a date string falls within the given period range.
 */
export function isWithinRange(dateStr: string, range: PeriodRange): boolean {
  return dateStr >= range.start && dateStr <= range.end;
}

/**
 * Normalize an arbitrary date string into the given timezone (used when an
 * anchor comes from outside, e.g. an API response).
 */
export function normalizeDate(dateStr: string, tz = DEFAULT_TZ): string {
  const parsed = parseISO(dateStr);
  if (Number.isNaN(parsed.getTime())) return getTodayString(tz);
  return formatInTimeZone(parsed, tz, 'yyyy-MM-dd');
}

/**
 * Ensure two surfaces display "today" identically.
 */
export function nowInTz(tz = DEFAULT_TZ): Date {
  return toZonedTime(new Date(), tz);
}