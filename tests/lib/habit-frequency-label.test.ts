import { describe, expect, it } from 'vitest';

import {
  getFrequencyLabel,
  resolvePerPeriodCount,
} from '@/lib/habits/frequency';

/*
 * The two columns that hold a per-period count, and why both must be read.
 *
 * `AddHabitModal` and the catalogue/starter-pack constants write `"2"` into
 * `frequencyValue`; `HabitScheduleEditor` writes `frequencyValue: null` and
 * keeps the number in `targetCount` (or `intervalDays` for EVERY_N_DAYS). A
 * label that read only `frequencyValue` rendered the second half of that with
 * no number at all, which is the bug these pin.
 */
describe('resolvePerPeriodCount', () => {
  it('prefers a parseable frequencyValue', () => {
    expect(resolvePerPeriodCount('4', 2)).toBe(4);
  });

  it('falls back to the column when frequencyValue is absent', () => {
    expect(resolvePerPeriodCount(null, 4)).toBe(4);
    expect(resolvePerPeriodCount(undefined, 4)).toBe(4);
  });

  it('rejects a weekday list rather than reading it as 1', () => {
    // parseInt("1,3,5") is 1, so an unanchored parse would label a
    // SPECIFIC_WEEKDAYS row "1x per week".
    expect(resolvePerPeriodCount('1,3,5', 3)).toBe(3);
    expect(resolvePerPeriodCount('0,6', 2)).toBe(2);
  });

  it('rejects non-numeric and non-positive values', () => {
    expect(resolvePerPeriodCount('abc', 2)).toBe(2);
    expect(resolvePerPeriodCount('0', 2)).toBe(2);
    expect(resolvePerPeriodCount('-3', 2)).toBe(2);
  });

  it('returns null when neither column holds a usable count', () => {
    expect(resolvePerPeriodCount(null, null)).toBeNull();
    expect(resolvePerPeriodCount(undefined, undefined)).toBeNull();
  });
});

describe('getFrequencyLabel', () => {
  it('prints the count written to frequencyValue', () => {
    expect(getFrequencyLabel('WEEKLY_TARGET', '2')).toBe('2x per week');
    expect(getFrequencyLabel('MONTHLY_TARGET', '1')).toBe('1x per month');
  });

  it('prints the count kept in targetCount when frequencyValue is null', () => {
    // The shape HabitScheduleEditor writes.
    expect(
      getFrequencyLabel('WEEKLY_TARGET', null, { targetCount: 4 })
    ).toBe('4x per week');
    expect(
      getFrequencyLabel('MONTHLY_TARGET', null, { targetCount: 3 })
    ).toBe('3x per month');
  });

  it('resolves EVERY_N_DAYS from intervalDays', () => {
    expect(getFrequencyLabel('EVERY_N_DAYS', null, { intervalDays: 2 })).toBe(
      'Every 2 days'
    );
    expect(getFrequencyLabel('EVERY_N_DAYS', null, { intervalDays: 21 })).toBe(
      'Every 3 weeks'
    );
    expect(getFrequencyLabel('EVERY_N_DAYS', null, { intervalDays: 7 })).toBe(
      'Every week'
    );
    expect(getFrequencyLabel('EVERY_N_DAYS', null, { intervalDays: 1 })).toBe(
      'Every day'
    );
  });

  it('falls back to intervalDays for a target cadence with no other column', () => {
    expect(
      getFrequencyLabel('WEEKLY_TARGET', null, { intervalDays: 5 })
    ).toBe('5x per week');
  });

  it('still labels a cadence with no count at all', () => {
    expect(getFrequencyLabel('WEEKLY_TARGET')).toBe('Weekly target');
    expect(getFrequencyLabel('MONTHLY_TARGET')).toBe('Monthly target');
    expect(getFrequencyLabel('YEARLY_TARGET')).toBe('Yearly target');
    expect(getFrequencyLabel('EVERY_N_DAYS')).toBe('Every N days');
  });

  it('is unchanged for the cadences it already handled', () => {
    expect(getFrequencyLabel('DAILY')).toBe('Every day');
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '1,2,3,4,5')).toBe('Weekdays');
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '0,6')).toBe('Weekends');
    expect(getFrequencyLabel('RANDOM')).toBe('Whenever you want');
    expect(getFrequencyLabel('ONE_TIME')).toBe('One time');
    expect(getFrequencyLabel('CUSTOM')).toBe('Custom schedule');
    expect(getFrequencyLabel('NOT_A_FREQ')).toBe('Unknown');
  });
});
