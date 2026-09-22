/**
 * Date utilities for RoutineOS.
 * All functions are timezone-aware. Default: Asia/Kolkata.
 */

import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addDays, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const DEFAULT_TZ = 'Asia/Kolkata';

/**
 * Get today's date string (YYYY-MM-DD) in the given timezone.
 */
export function getTodayString(tz = DEFAULT_TZ): string {
  const now = toZonedTime(new Date(), tz);
  return format(now, 'yyyy-MM-dd');
}

export function todayForUser(timezone = DEFAULT_TZ): string {
  return getTodayString(timezone);
}

export function nowForUser(timezone = DEFAULT_TZ): string {
  const zoned = toZonedTime(new Date(), timezone);
  return format(zoned, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Get a Date object for "now" in the user's timezone.
 */
export function getNowInTz(tz = DEFAULT_TZ): Date {
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
 * Get the start and end of a week (default: week starts Monday).
 */
export function getWeekRange(
  dateStr: string,
  weekStartsOn: 0 | 1 = 1,
  _tz = DEFAULT_TZ
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
 */
export function getDayOfWeek(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE');
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
