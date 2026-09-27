/**
 * Habit Scheduling — CANONICAL implementation.
 *
 * This is the single place that answers "is this habit scheduled on this date?".
 * It previously had a twin in `lib/scheduling.ts` with a narrower frequency
 * union, no timezone support (it derived the weekday from the server's local
 * time, which is wrong for every non-UTC user) and no archived-habit check.
 * That twin has been removed; this module is the only one.
 *
 * @see lib/habits/frequency.ts for frequency-value parsing and labels.
 */

import { Habit } from '@/types/habit';
import { parseFrequencyConfig } from './frequency';

/**
 * Weekday (0 = Sunday … 6 = Saturday) of a `YYYY-MM-DD` calendar date.
 *
 * A calendar date carries no timezone: '2026-09-28' is Monday, full stop. The
 * previous implementation parsed the string into a `Date` and asked for its
 * weekday in some zone via `format(date, 'i', { timeZone })` — an API that does
 * not exist, so `timeZone` was silently ignored and the weekday actually came
 * from the *server's* local time. A user in Auckland with a "Mondays" habit was
 * evaluated in the server's zone instead of their own.
 *
 * Reading the weekday straight off the calendar date is both correct and immune
 * to DST, because no instant conversion happens at all.
 */
function weekdayOfCalendarDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  if (Number.isNaN(parsed.getTime())) return NaN;
  return parsed.getUTCDay();
}

/**
 * Whether a habit is scheduled for `date` (YYYY-MM-DD).
 *
 * @param timezone Accepted so call sites can state intent explicitly, and kept
 *   for API compatibility. It does not change the result: `date` is a calendar
 *   date belonging to the user, so its weekday is already fixed.
 */
export function isHabitScheduledForDate(
  habit: Habit,
  date: string,
  timezone: string = 'UTC'
): boolean {
  void timezone;

  if (habit.status === 'ARCHIVED') return false;

  const config = parseFrequencyConfig(habit.frequencyValue);

  if (!config) return true; // Default to daily if no config

  switch (habit.frequencyType) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_WEEKDAYS': {
      if (!config.daysOfWeek) return false;
      return config.daysOfWeek.includes(weekdayOfCalendarDate(date));
    }
    // Target-based and open-ended frequencies are available every day; whether
    // the target is already met is a separate question answered by the caller.
    // These previously fell through to `default: return false`, which made
    // YEARLY_TARGET and RANDOM habits permanently unschedulable.
    case 'WEEKLY_TARGET':
    case 'MONTHLY_TARGET':
    case 'YEARLY_TARGET':
    case 'RANDOM':
      return true;
    case 'ONE_TIME':
      return config.exactDates?.includes(date) ?? false;
    case 'CUSTOM':
      return true; // Simplification for now
    default:
      return false;
  }
}

export function isHabitScheduled(habit: Habit, date: string, timezone: string = 'UTC'): boolean {
  return isHabitScheduledForDate(habit, date, timezone);
}
