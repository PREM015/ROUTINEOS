/**
 * Date utilities for RoutineOS.
 *
 * All functions are timezone-aware. There is deliberately **no default
 * timezone**: `getTodayString` used to default to `Asia/Kolkata`, which made
 * "forgot to pass the user's timezone" type-check, lint clean, and silently
 * wrong — every such call site bucketed by IST+5:30. In this repo that is the
 * *right* zone for nobody but its author, and it was the reason a user in
 * `America/New_York` saw tomorrow's score between local midnight and 05:30.
 *
 * Every caller must now name a zone. Use the user's `settings.timezone` on the
 * server, and `useUserTimezone()` on the client.
 */

import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addDays, subDays } from 'date-fns';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Last-resort zone for a request whose user row could not be read.
 *
 * UTC rather than a real region on purpose: it is the one zone guaranteed not
 * to invent an offset, and every caller that reaches this is already on an
 * error path.
 */
export const DEFAULT_TZ = 'UTC';

/**
 * Get today's date string (YYYY-MM-DD) in the given timezone.
 *
 * `tz` is required. See the module comment.
 */
export function getTodayString(tz: string): string {
  const now = toZonedTime(new Date(), tz);
  return format(now, 'yyyy-MM-dd');
}

/** Today's date for a user whose timezone is `timezone`. */
export function todayForUser(timezone: string): string {
  return getTodayString(timezone);
}

export function nowForUser(timezone: string): string {
  const zoned = toZonedTime(new Date(), timezone);
  return format(zoned, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Get a Date object for "now" in the user's timezone.
 */
export function getNowInTz(tz: string): Date {
  return toZonedTime(new Date(), tz);
}

/**
 * Format a date string for display.
 */
export function formatDisplayDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return format(d, 'EEE, MMM d');
}

/**
 * Whether `value` is a real `YYYY-MM-DD` calendar date.
 *
 * A shape check is not enough, and that is the whole point of this function.
 * `/^\d{4}-\d{2}-\d{2}$/` happily accepts `2026-13-45` and `2026-02-31`, which
 * then reach `fromZonedTime` as an Invalid Date and `parseISO` as a NaN
 * timestamp. A NaN does not fail loudly on the way out: it propagates into every
 * average derived from it, so a malformed anchor produced a page of plausible
 * numbers that were all silently wrong.
 *
 * The parsed instant is compared back against its own text, which rejects both
 * the impossible fields and the rolled-over ones (31 February parses as 3 March,
 * and 29 February in a common year as 1 March) while accepting a genuine 29
 * February in a leap year.
 */
export function isCalendarDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Get the start and end of a week (default: week starts Monday).
 *
 * `tz` is accepted for call-site clarity but a `YYYY-MM-DD` calendar date has
 * an intrinsic weekday, so it is parsed as UTC midnight and formatted in UTC.
 * Formatting it in a user zone shifted the week for anyone west of it — a
 * Sunday resolved to the *following* week.
 */
export function getWeekRange(
  dateStr: string,
  weekStartsOn: 0 | 1 = 1,
  _tz?: string
): { start: string; end: string } {
  const d = parseISO(dateStr);
  const start = startOfWeek(d, { weekStartsOn });
  const end = endOfWeek(d, { weekStartsOn });
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

/**
 * Get all days in a week as YYYY-MM-DD strings.
 */
export function getWeekDays(
  dateStr: string,
  weekStartsOn: 0 | 1 = 1
): string[] {
  const d = parseISO(dateStr);
  const start = startOfWeek(d, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(start, i), 'yyyy-MM-dd')
  );
}

/**
 * Get all days in a month.
 */
export function getMonthDays(year: number, month: number): string[] {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(new Date(year, month - 1));
  return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
}

/**
 * Get days remaining until a target date.
 */
export function getDaysRemaining(endDateStr: string, tz = DEFAULT_TZ): number {
  const today = parseISO(getTodayString(tz));
  const end = parseISO(endDateStr);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Parse HH:mm time string and return total minutes from midnight.
 */
export function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculate available sleep window between bedtime and wake time.
 * Returns minutes. Handles overnight (e.g. 23:00 to 06:00).
 */
export function calculateSleepWindow(bedtime: string, wakeTime: string): number {
  const bed = timeToMinutes(bedtime);
  const wake = timeToMinutes(wakeTime);
  if (wake > bed) return wake - bed;
  // Overnight
  return (24 * 60 - bed) + wake;
}

/**
 * Check if the current routine allows the target sleep duration.
 */
export function hasSleepConflict(
  bedtime: string,
  wakeTime: string,
  targetMinutes: number
): boolean {
  const available = calculateSleepWindow(bedtime, wakeTime);
  return available < targetMinutes;
}

/**
 * Format minutes as "Xh Ym".
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Determine the day of week name from a YYYY-MM-DD string.
 *
 * Parsed and formatted in UTC: `parseISO` yields a host-local midnight, so
 * `format` on that value reports the previous weekday for any host west of UTC.
 */
export function getDayOfWeek(dateStr: string): string {
  return formatInTimeZone(new Date(`${dateStr}T00:00:00.000Z`), 'UTC', 'EEEE');
}

/**
 * Step a `YYYY-MM-DD` calendar date by whole days.
 *
 * Pure string/UTC arithmetic. The obvious alternative —
 * `new Date(d); d.setDate(d.getDate() + n); d.toISOString().slice(0,10)` — mixes
 * three different frames: `new Date('2026-09-28')` is UTC midnight, `getDate()`
 * reads the **host-local** day, and `toISOString()` re-anchors to UTC. On a host
 * west of UTC `previousCalendarDay('2026-09-01')` returned the 31st of August
 * instead of the 31st, and the result depended on the server's timezone.
 *
 * A `YYYY-MM-DD` date is a calendar label, not an instant, so it is stepped as
 * one.
 */
export function shiftCalendarDay(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** The calendar day before `dateStr`. */
export function previousCalendarDay(dateStr: string): string {
  return shiftCalendarDay(dateStr, -1);
}

/** The calendar day after `dateStr`. */
export function nextCalendarDay(dateStr: string): string {
  return shiftCalendarDay(dateStr, 1);
}

/**
 * Whole calendar days from `from` to `to` (negative when `to` is earlier).
 *
 * Counted on `YYYY-MM-DD` labels rather than by subtracting `Date` millis.
 * `new Date('2026-09-28')` is UTC midnight, so a difference computed that way
 * against a locally-parsed date is short by the host's UTC offset — up to a full
 * day — and the error varies with the server's timezone.
 */
export function calendarDaysBetween(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * The half-open `[start, end)` instant range covering one calendar day in the
 * given zone.
 *
 * `new Date(y, m, d)` — the pattern this replaces — builds a midnight in the
 * **host's** zone. On a UTC server that is the wrong instant for any user who is
 * not, so "is this session running today?" was answered against the server's
 * idea of the day: a user in `Asia/Tokyo` had their evening sessions counted as
 * yesterday, and a user in `America/New_York` had sessions before 09:00 local
 * counted as the previous day.
 *
 * `date` defaults to the user's current day in that zone.
 */
export function dayBoundsInTimezone(
  tz: string,
  date?: string
): { start: Date; end: Date } {
  const day = date ?? getTodayString(tz);
  return {
    start: fromZonedTime(`${day}T00:00:00`, tz),
    end: fromZonedTime(`${nextCalendarDay(day)}T00:00:00`, tz),
  };
}

/**
 * Check if two YYYY-MM-DD strings are the same day.
 */
export function isSameDayStr(a: string, b: string): boolean {
  return a === b;
}

/**
 * Get previous N days as date strings.
 */
export function getPastNDays(n: number, tz = DEFAULT_TZ): string[] {
  const today = parseISO(getTodayString(tz));
  return Array.from({ length: n }, (_, i) =>
    format(subDays(today, n - 1 - i), 'yyyy-MM-dd')
  );
}
