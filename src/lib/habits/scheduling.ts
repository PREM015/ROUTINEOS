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
 * The only three fields this module reads.
 *
 * Declared structurally rather than taking the full `Habit` so the same function
 * can be called from a `'use client'` component holding the reduced `Habit` in
 * `AppContext` (which models `frequencyValue` as `string | null | undefined`
 * against Prisma's required `string`) and from the server holding a full
 * `HabitWithRelations`. Those two types are not assignable to each other, so a
 * full `Habit` parameter forced a cast at the client call site.
 */
export type SchedulableHabit = {
  status: Habit['status'];
  frequencyType: Habit['frequencyType'];
  frequencyValue?: string | null;
  /**
   * For `EVERY_N_DAYS`: the gap in calendar days, and the anchor the gap is
   * counted from. Both optional because the reduced client-side `Habit` in
   * `AppContext` does not carry them yet; a habit with `EVERY_N_DAYS` but no
   * usable pair falls back to daily rather than silently never being scheduled.
   */
  intervalDays?: number | null;
  startDate?: Date | string | null;
};

/** Calendar days between two `YYYY-MM-DD` strings, ignoring time of day. */
function calendarDayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/** The `YYYY-MM-DD` day part of a `Habit.startDate`, whatever shape it arrives in. */
function calendarDayOf(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  habit: SchedulableHabit,
  date: string,
  timezone: string = 'UTC'
): boolean {
  void timezone;

  if (habit.status === 'ARCHIVED') return false;

  const config = parseFrequencyConfig(habit.frequencyValue);

  /*
   * `EVERY_N_DAYS` is checked *before* the "no config means daily" early return
   * below. An interval habit normally carries no `frequencyValue` at all — the
   * gap lives in `intervalDays` — so that early return would otherwise make
   * every interval habit daily, and a "dentist every 180 days" habit would sit
   * on the checklist forever.
   */
  if (habit.frequencyType === 'EVERY_N_DAYS') {
    const gap = habit.intervalDays ?? config?.intervalDays ?? null;
    if (!gap || gap < 1) return true; // Unusable gap: fall back to daily, never to "never".

    const anchor = habit.startDate ? calendarDayOf(habit.startDate) : null;
    // Without an anchor there is nothing to count from, so treat the habit as
    // due rather than as never due. "Invisible forever" is the worse failure.
    if (!anchor) return true;

    const diff = calendarDayDiff(anchor, date);
    // Dates before the anchor are handled by the start-date eligibility check;
    // here we only care that the gap divides evenly.
    return diff >= 0 && diff % gap === 0;
  }

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

export function isHabitScheduled(habit: SchedulableHabit, date: string, timezone: string = 'UTC'): boolean {
  return isHabitScheduledForDate(habit, date, timezone);
}
