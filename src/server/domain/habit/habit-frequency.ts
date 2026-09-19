/**
 * Habit Frequency – pure domain logic for habit scheduling cadence.
 * Given a habit's frequency type + frequency value, computes occurrence dates.
 * No DB access; callers supply habit fields directly.
 */

import type { HabitFrequencyType } from '@/generated/prisma/client';

const MS_PER_DAY = 86_400_000;

// ============================================================================
// Types
// ============================================================================

/** Weekday numbers, 0 = Sunday .. 6 = Saturday. */
export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Weekly / monthly / yearly target frequency (count per period). */
export interface FrequencyInfo {
  type: Exclude<HabitFrequencyType, 'RANDOM' | 'ONE_TIME' | 'CUSTOM'>;
  /** Count of required repetition per period (weekly=per week, monthly=per month). */
  count?: number;
  /** Weekday numbers for SPECIFIC_WEEKDAYS. */
  weekdays?: WeekdayNumber[];
  /** Interval in days when frequency uses repetition (every N days). */
  repeatEvery?: number;
}

/** Parsed configuration for date occurrence. */
export interface OccurrenceConfig {
  /** Weekday numbers for SPECIFIC_WEEKDAYS, otherwise []. */
  weekdays: WeekdayNumber[];
  /** Repeat every N days, defaults to 1 → every day. */
  repeatEvery: number;
  /** Per-period count for WEEKLY/MONTHLY/YEARLY targets. */
  count?: number;
}

// ============================================================================
// Helpers (UTC date math on YYYY-MM-DD strings)
// ============================================================================

function toMs(dateStr: string): number {
  const [y = '1970', m = '1', d = '1'] = dateStr.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function addDays(dateStr: string, days: number): string {
  return new Date(toMs(dateStr) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function getWeekday(dateStr: string): number {
  return new Date(toMs(dateStr)).getUTCDay();
}

/**
 * Parse a weekday list string like `"0,2,4"` (0 = Sunday).
 * Returns [] when the string is empty/invalid.
 * @example
 * parseWeekdayList("1,3,5") // => [1, 3, 5]
 */
export function parseWeekdayList(value: string | null | undefined): WeekdayNumber[] {
  if (!value) return [];
  const parsed: WeekdayNumber[] = [];
  for (const part of value.split(',')) {
    const num = Number(part.trim());
    if (Number.isInteger(num) && num >= 0 && num <= 6) {
      parsed.push(num as WeekdayNumber);
    }
  }
  return [...new Set(parsed)].sort((a, b) => a - b);
}

/**
 * Parse a habit's `frequencyValue` into a configuration object.
 * DAILY stores an optional repeat-every interval (`"2"` = every 2 days).
 * SPECIFIC_WEEKDAYS stores `"1,3,5"` (0=Sun..6=Sat).
 * WEEKLY/MONTHLY/YEARLY_TARGET store a count.
 * RANDOM/ONE_TIME/CUSTOM have no parseable cadence → default occurrence point.
 * @example
 * parseFrequencyValue('DAILY', '2') // => { weekdays: [], repeatEvery: 2 }
 * parseFrequencyValue('SPECIFIC_WEEKDAYS', '1,3,5') // => { weekdays: [1, 3, 5], repeatEvery: 1 }
 */
export function parseFrequencyValue(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
): OccurrenceConfig {
  const value = frequencyValue ?? '';

  switch (type) {
    case 'SPECIFIC_WEEKDAYS': {
      const weekdays = parseWeekdayList(value);
      return { weekdays, repeatEvery: 1 };
    }
    case 'DAILY': {
      const repeatEvery = Math.max(1, parseInt(value, 10) || 1);
      return { weekdays: [], repeatEvery };
    }
    case 'WEEKLY_TARGET':
    case 'MONTHLY_TARGET':
    case 'YEARLY_TARGET': {
      const count = Math.max(0, parseInt(value, 10) || 0);
      return { weekdays: [], repeatEvery: 1, count };
    }
    default:
      return { weekdays: [], repeatEvery: 1 };
  }
}

/**
 * All occurrence dates in `[start, end]` (inclusive) for a DAILY / SPECIFIC_WEEKDAYS
 * habit. Target-count types return the given range's days only when the period
 * count can be satisfied; they are otherwise excluded from the occurrence list
 * because occurrences depend on completion distribution, which is stateful.
 * @example
 * scheduledDatesInRange('DAILY', '2026-01-01', '2026-01-03', '1')
 * // => ['2026-01-01', '2026-01-02', '2026-01-03']
 */
export function scheduledDatesInRange(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
  start: string,
  end: string,
): string[] {
  const cfg = parseFrequencyValue(type, frequencyValue);

  switch (type) {
    case 'SPECIFIC_WEEKDAYS': {
      const dates: string[] = [];
      for (let d = start; toMs(d) <= toMs(end); d = addDays(d, 1)) {
        if (cfg.weekdays.includes(getWeekday(d) as WeekdayNumber)) {
          dates.push(d);
        }
      }
      return dates;
    }
    case 'DAILY': {
      const dates: string[] = [];
      if (cfg.repeatEvery <= 1) {
        for (let d = start; toMs(d) <= toMs(end); d = addDays(d, 1)) {
          dates.push(d);
        }
        return dates;
      }
      // Propagate the interval from start (assumes start alignment).
      for (let d = start; toMs(d) <= toMs(end); d = addDays(d, cfg.repeatEvery)) {
        dates.push(d);
      }
      return dates;
    }
    case 'RANDOM':
      // Random habits have no deterministic occurrences.
      return [];
    case 'ONE_TIME':
    case 'CUSTOM':
      // One-time / custom habits occur once on their start date, which is not
      // available here – deterministic range occurrences cannot be derived.
      return [];
    default:
      // WEEKLY/MONTHLY/YEARLY_TARGET – occurrence depends on stateful counts.
      return [];
  }
}

/**
 * Whether a habit is scheduled on a given date.
 * @example
 * isHabitScheduledOn('SPECIFIC_WEEKDAYS', '1,3,5', '2026-09-16')
 * // true when 2026-09-16 is a Wednesday, false otherwise
 */
export function isHabitScheduledOn(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
  date: string,
): boolean {
  const dates = scheduledDatesInRange(type, frequencyValue, date, date);
  return dates.length > 0;
}

/**
 * Number of instances expected per week for a habit.
 * @example
 * daysScheduledPerWeek('DAILY', undefined) // => 7
 * daysScheduledPerWeek('SPECIFIC_WEEKDAYS', '1,3,5') // => 3
 * daysScheduledPerWeek('WEEKLY_TARGET', '4') // => 4
 */
export function daysScheduledPerWeek(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
): number {
  switch (type) {
    case 'DAILY':
      return 7;
    case 'SPECIFIC_WEEKDAYS': {
      // Measure over a full week to avoid edge alignment issues.
      const week = scheduledDatesInRange(type, frequencyValue, '2026-01-05', '2026-01-11');
      return week.length;
    }
    case 'WEEKLY_TARGET': {
      const cfg = parseFrequencyValue(type, frequencyValue);
      return Math.min(7, cfg.count ?? 0);
    }
    case 'RANDOM':
      // Random habits have an unclear weekly cadence – return a positive default.
      return 1;
    default:
      return 0;
  }
}

/**
 * The next date on which a DAILY / SPECIFIC_WEEKDAYS habit occurs at-or-after
 * `fromDate`. Returns `null` when the habit has no deterministic future
 * occurrence (e.g. RANDOM, or target-count types).
 * @example
 * getNextScheduledDate('SPECIFIC_WEEKDAYS', '3', '2026-09-15')
 * // => next Wednesday at-or-after 2026-09-15
 */
export function getNextScheduledDate(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
  fromDate: string,
): string | null {
  if (type === 'RANDOM') return null;

  for (let d = fromDate; ; d = addDays(d, 1)) {
    if (isHabitScheduledOn(type, frequencyValue, d)) {
      return d;
    }
    // Bounded search: max 400 days into the future.
    if (d > addDays(fromDate, 400)) return null;
  }
}

// ============================================================================
// Frequency info extraction
// ============================================================================

/**
 * Human-friendly frequency descriptor + counted cadence from a habit.
 * @example
 * extractFrequencyInfo('DAILY', undefined)
 * // => { type: 'DAILY', repeatEvery: 1 }
 */
export function extractFrequencyInfo(
  type: HabitFrequencyType,
  frequencyValue: string | null | undefined,
): FrequencyInfo {
  const cfg = parseFrequencyValue(type, frequencyValue);

  switch (type) {
    case 'SPECIFIC_WEEKDAYS':
      return { type, weekdays: cfg.weekdays };
    case 'DAILY':
      return { type, repeatEvery: cfg.repeatEvery };
    case 'WEEKLY_TARGET':
    case 'MONTHLY_TARGET':
    case 'YEARLY_TARGET':
      return { type, count: cfg.count };
    default:
      return { type: 'DAILY', repeatEvery: 1 };
  }
}