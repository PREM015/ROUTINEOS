/**
 * Habit Frequency Calculations
 * Calculate habit frequency patterns and metadata
 */

import type { HabitFrequencyType } from '@/generated/prisma';

/**
 * Where the per-period count lives, for the label.
 *
 * Two columns hold it because two writers disagree: `AddHabitModal` and the
 * catalogue / starter-pack constants write the number into `frequencyValue`
 * (`"2"` for twice a week), while `HabitScheduleEditor` writes
 * `frequencyValue: null` and keeps the number in `targetCount`. Reading only
 * one column made the other's rows print a label with no number at all —
 * "Weekly target" instead of "4x per week" — so a habit saved from the
 * Schedule tab looked as though it had lost its target.
 *
 * `frequencyValue` wins when it parses, so the explicit per-row value still
 * overrides a later change of mind; `targetCount` (or `intervalDays`) is the
 * fallback rather than a competing spelling.
 */
export function resolvePerPeriodCount(
  frequencyValue?: string | null,
  fallback?: number | null
): number | null {
  const raw = frequencyValue?.trim();
  // Anchored, so a comma-joined weekday list ("1,3,5") or a JSON blob is not
  // silently read as "1". `parseInt("1,3,5")` is 1, which is exactly how a
  // SPECIFIC_WEEKDAYS row could end up labelled "1x per week".
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n > 0) return n;
  }
  if (fallback != null && fallback > 0) return fallback;
  return null;
}

export interface FrequencyConfig {
  daysOfWeek?: number[];
  exactDates?: string[];
  /**
   * Optional carry for `EVERY_N_DAYS` when the gap was written into
   * `frequencyValue` rather than the dedicated `Habit.intervalDays` column.
   * Both are read by `isHabitScheduledForDate`, with the column winning.
   */
  intervalDays?: number;
  [key: string]: unknown;
}

export function parseFrequencyConfig(configStr?: string | null): FrequencyConfig | null {
  if (!configStr) return null;
  try {
    if (typeof configStr === 'object') return configStr as FrequencyConfig;
    const parsed = JSON.parse(configStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FrequencyConfig;
    }
  } catch {
    // fall through to the legacy comma-separated / plain-number format
  }
  if (configStr.includes(',') || /^\d+$/.test(configStr.trim())) {
    const days = configStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    return { daysOfWeek: days };
  }
  return null;
}

/**
 * The label a habit row prints for its cadence.
 *
 * Reads the per-period count from whichever column holds it — see
 * `resolvePerPeriodCount` for why there are two. The fallbacks are `Habit` /
 * `HabitDefinition` columns, not a second spelling of the same thing, so a row
 * saved by the Schedule editor ("frequencyValue is null, targetCount is 4")
 * labelled "Weekly target" for as long as the label only looked at
 * `frequencyValue`.
 */
export function getFrequencyLabel(
  frequencyType: HabitFrequencyType | string,
  frequencyValue?: string | null,
  counts?: { targetCount?: number | null; intervalDays?: number | null }
): string {
  const perPeriod = resolvePerPeriodCount(
    frequencyValue,
    counts?.targetCount ?? counts?.intervalDays
  );

  switch (frequencyType) {
    case 'DAILY':
      return 'Every day';

    case 'EVERY_N_DAYS': {
      const gap = perPeriod;
      if (gap === null) return 'Every N days';
      if (gap === 1) return 'Every day';
      if (gap % 7 === 0) {
        const weeks = gap / 7;
        return weeks === 1 ? 'Every week' : `Every ${weeks} weeks`;
      }
      return `Every ${gap} days`;
    }

    case 'SPECIFIC_WEEKDAYS':
      return formatWeekdays(frequencyValue);

    case 'WEEKLY_TARGET':
      return perPeriod === null ? 'Weekly target' : `${perPeriod}x per week`;

    case 'MONTHLY_TARGET':
      return perPeriod === null ? 'Monthly target' : `${perPeriod}x per month`;

    case 'YEARLY_TARGET':
      return perPeriod === null ? 'Yearly target' : `${perPeriod}x per year`;

    case 'RANDOM':
      return 'Whenever you want';

    case 'ONE_TIME':
      return 'One time';

    case 'CUSTOM':
      return 'Custom schedule';

    default:
      return 'Unknown';
  }
}

function formatWeekdays(value?: string | null): string {
  if (!value) return 'No days';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdays = value.split(',').map(Number);

  if (weekdays.length === 7) {
    return 'Every day';
  }

  if (weekdays.length === 5 && JSON.stringify(weekdays) === JSON.stringify([1, 2, 3, 4, 5])) {
    return 'Weekdays';
  }

  if (weekdays.length === 2 && JSON.stringify(weekdays) === JSON.stringify([0, 6])) {
    return 'Weekends';
  }

  return weekdays.map(d => dayNames[d]).join(', ');
}

export function calculateCompletionTarget(
  frequencyType: string,
  frequencyValue?: string | null,
  period: 'week' | 'month' | 'year' = 'month'
): number {
  switch (frequencyType) {
    case 'DAILY':
      if (period === 'week') return 7;
      if (period === 'month') return 30;
      if (period === 'year') return 365;
      return 30;

    case 'SPECIFIC_WEEKDAYS':
      if (!frequencyValue) return 0;
      const weekdaysCount = frequencyValue.split(',').length;
      if (period === 'week') return weekdaysCount;
      if (period === 'month') return Math.ceil((weekdaysCount / 7) * 30);
      if (period === 'year') return weekdaysCount * 52;
      return weekdaysCount * 4;

    case 'WEEKLY_TARGET':
      if (!frequencyValue) return 0;
      const perWeek = parseInt(frequencyValue);
      if (period === 'week') return perWeek;
      if (period === 'month') return Math.ceil(perWeek * 4.3);
      if (period === 'year') return perWeek * 52;
      return perWeek * 4;

    case 'MONTHLY_TARGET':
      if (!frequencyValue) return 0;
      const perMonth = parseInt(frequencyValue);
      if (period === 'month') return perMonth;
      if (period === 'year') return perMonth * 12;
      return Math.ceil(perMonth / 4);

    case 'YEARLY_TARGET':
      if (!frequencyValue) return 0;
      return parseInt(frequencyValue);

    default:
      return 0;
  }
}
