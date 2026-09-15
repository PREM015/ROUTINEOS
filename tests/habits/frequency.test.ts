import { describe, it, expect } from 'vitest';
import { isHabitScheduledForDate } from '../../src/lib/habits/frequency';

describe('isHabitScheduledForDate', () => {
  it('isHabitScheduledForDate with DAILY', () => {
    expect(isHabitScheduledForDate({ type: 'DAILY' }, new Date())).toBe(true);
  });
  it('isHabitScheduledForDate with SPECIFIC_WEEKDAYS', () => {
    expect(isHabitScheduledForDate({ type: 'SPECIFIC_WEEKDAYS', days: [1, 3, 5] }, new Date('2023-10-02T12:00:00Z'))).toBe(true); // Monday
  });
  it('isHabitScheduledForDate with WEEKLY_TARGET', () => {
    expect(isHabitScheduledForDate({ type: 'WEEKLY_TARGET', target: 3 }, new Date())).toBe(true);
  });
  it('Weekday parsing, Monday=1', () => {
    const date = new Date('2023-10-02T12:00:00Z');
    expect(date.getUTCDay()).toBe(1); // Monday is 1 in JS getUTCDay
  });
});
