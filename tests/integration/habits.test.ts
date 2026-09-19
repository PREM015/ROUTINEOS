import { describe, expect, it } from 'vitest';

import {
  calculateCompletionTarget,
  getFrequencyLabel,
} from '../../src/lib/habits/frequency';
import {
  createSkipOverride,
  getSkipReason,
  isHabitSkippedOnDate,
} from '../../src/lib/habits/skip';
import {
  getPauseStatus,
  isHabitPaused,
  shouldAutoResume,
} from '../../src/lib/habits/pause';
import { makeHabit } from '../utils/db';

describe('habit frequency helpers', () => {
  it('labels daily habits', () => {
    expect(getFrequencyLabel('DAILY')).toBe('Every day');
  });

  it('labels specific weekday patterns', () => {
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '1,2,3,4,5')).toBe('Weekdays');
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '0,6')).toBe('Weekends');
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '1,3,5')).toBe('Mon, Wed, Fri');
    expect(getFrequencyLabel('SPECIFIC_WEEKDAYS', '0,1,2,3,4,5,6')).toBe('Every day');
  });

  it('labels weekly and ad-hoc targets', () => {
    expect(getFrequencyLabel('WEEKLY_TARGET', '3')).toBe('3x per week');
    expect(getFrequencyLabel('WEEKLY_TARGET', null)).toBe('Weekly target');
    expect(getFrequencyLabel('RANDOM')).toBe('Whenever you want');
  });

  it('falls back to Unknown for unrecognized types', () => {
    expect(getFrequencyLabel('BOGUS_TYPE')).toBe('Unknown');
  });

  it('computes completion targets from frequency metadata', () => {
    expect(calculateCompletionTarget('DAILY', null, 'week')).toBe(7);
    expect(calculateCompletionTarget('DAILY', null, 'month')).toBe(30);
    expect(calculateCompletionTarget('DAILY', null, 'year')).toBe(365);
    expect(calculateCompletionTarget('WEEKLY_TARGET', '4', 'month')).toBe(18);
    expect(calculateCompletionTarget('WEEKLY_TARGET', '4', 'year')).toBe(208);
    expect(calculateCompletionTarget('MONTHLY_TARGET', '12', 'year')).toBe(144);
    expect(calculateCompletionTarget('BOGUS_TYPE', null)).toBe(0);
  });
});

describe('habit skip logic', () => {
  it('builds a skip override for a date', () => {
    const override = createSkipOverride('habit-1', 'user-1', '2026-09-17', 'Rest day');
    expect(override).toMatchObject({
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-09-17',
      overrideType: 'SKIP',
      reason: 'Rest day',
    });
  });

  it('detects skips on the override date only', () => {
    const override = createSkipOverride('habit-1', 'user-1', '2026-09-17', 'Rest day');
    const overrides = [override] as Parameters<typeof isHabitSkippedOnDate>[0];
    expect(isHabitSkippedOnDate(overrides, '2026-09-17')).toBe(true);
    expect(isHabitSkippedOnDate(overrides, '2026-09-18')).toBe(false);
    expect(getSkipReason(overrides, '2026-09-17')).toBe('Rest day');
    expect(getSkipReason(overrides, '2026-09-18')).toBeNull();
  });
});

describe('habit pause logic', () => {
  it('pauses only when status is PAUSED', () => {
    type HabitLike = Parameters<typeof isHabitPaused>[0];
    expect(isHabitPaused(makeHabit() as HabitLike, '2026-09-17')).toBe(false);
    expect(
      isHabitPaused(
        makeHabit({ status: 'PAUSED', pausedUntil: '2026-09-30' }) as HabitLike,
        '2026-09-17'
      )
    ).toBe(true);
    expect(
      isHabitPaused(makeHabit({ status: 'PAUSED', pausedUntil: null }) as HabitLike, '2026-09-17')
    ).toBe(true);
    expect(
      isHabitPaused(
        makeHabit({ status: 'PAUSED', pausedUntil: '2026-09-10' }) as HabitLike,
        '2026-09-17'
      )
    ).toBe(false);
  });

  it('suggests auto-resume only after the pause window passes', () => {
    type HabitLike = Parameters<typeof shouldAutoResume>[0];
    expect(
      shouldAutoResume(
        makeHabit({ status: 'PAUSED', pausedUntil: '2026-09-10' }) as HabitLike,
        '2026-09-17'
      )
    ).toBe(true);
    expect(
      shouldAutoResume(
        makeHabit({ status: 'PAUSED', pausedUntil: '2026-09-30' }) as HabitLike,
        '2026-09-17'
      )
    ).toBe(false);
    expect(shouldAutoResume(makeHabit() as HabitLike, '2026-09-17')).toBe(false);
  });

  it('reports pause status including reason and ISO expiry', () => {
    type HabitLike = Parameters<typeof getPauseStatus>[0];
    const status = getPauseStatus(
      makeHabit({ status: 'PAUSED', pausedUntil: '2026-09-30', pauseReason: 'Travel' }) as HabitLike
    );
    expect(status.isPaused).toBe(true);
    expect(status.pausedUntil).toBe(new Date('2026-09-30').toISOString());
    expect(status.reason).toBe('Travel');
  });
});