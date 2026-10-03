import { describe, expect, it } from 'vitest';
import {
  rollupByDayType,
  toWeekDays,
  weekAverage,
  weekdayLabel,
} from '@/lib/routine/week-pattern';
import type { RoutineProgressDay, RoutineProgressResponse } from '@/types/routine';
import type { DayType } from '@/generated/prisma';

function day(overrides: Partial<RoutineProgressDay> = {}): RoutineProgressDay {
  return {
    date: '2026-10-05',
    dayType: 'WORKDAY' as DayType,
    dayTypeName: 'Workday',
    dayTypeColor: '#3b82f6',
    scheduled: true,
    total: 4,
    completed: 2,
    completionRate: 50,
    blocks: [],
    ...overrides,
  };
}

function response(days: RoutineProgressDay[]): RoutineProgressResponse {
  return {
    period: 'week',
    anchorDate: days[0]?.date ?? '2026-10-05',
    startDate: days[0]?.date ?? '2026-10-05',
    endDate: days[days.length - 1]?.date ?? '2026-10-05',
    label: 'Oct 5 – Oct 11',
    days,
    months: [],
  };
}

describe('weekdayLabel', () => {
  it('labels a Monday-start week correctly', () => {
    // 2026-10-05 is a Monday; the week runs Mon 5th through Sun 11th.
    expect(weekdayLabel('2026-10-05')).toBe('Mon');
    expect(weekdayLabel('2026-10-06')).toBe('Tue');
    expect(weekdayLabel('2026-10-09')).toBe('Fri');
    expect(weekdayLabel('2026-10-10')).toBe('Sat');
    expect(weekdayLabel('2026-10-11')).toBe('Sun');
  });

  it('is not shifted by the host timezone', () => {
    /*
     * The bug this guards: `new Date('2026-10-05').getDay()` parses as UTC
     * midnight, so west of Greenwich it returns Sunday and a Monday-start strip
     * renders its first day as "Sun". Computed from days-since-epoch, the label
     * is host-independent.
     */
    expect(weekdayLabel('2026-10-05')).not.toBe('Sun');
    // A year boundary, where a timezone shift is most likely to leak.
    expect(weekdayLabel('2026-01-01')).toBe('Thu');
    expect(weekdayLabel('2026-12-31')).toBe('Thu');
  });

  it('degrades one label rather than throwing on a malformed date', () => {
    expect(weekdayLabel('nonsense')).toBe('—');
    expect(weekdayLabel('2026-13-01')).toBe('—');
    expect(weekdayLabel('')).toBe('—');
  });
});

describe('toWeekDays', () => {
  it('turns a day with nothing tracked into null, never zero', () => {
    /*
     * `total: 0` with `completionRate: 0` is what the service sends for a day
     * with no tracked blocks. Rendering that 0 as a rate would claim the user
     * completed nothing, which is not the same as having had nothing to tick.
     */
    const days = toWeekDays(
      response([day({ date: '2026-10-05', total: 0, completed: 0, completionRate: 0 })]),
      '2026-10-05'
    );

    expect(days[0]?.completionRate).toBeNull();
  });

  it('keeps a genuine zero as zero', () => {
    const days = toWeekDays(
      response([day({ total: 4, completed: 0, completionRate: 0 })]),
      '2026-10-05'
    );

    expect(days[0]?.completionRate).toBe(0);
  });

  it('marks today and future days against the supplied date', () => {
    const days = toWeekDays(
      response([
        day({ date: '2026-10-04' }),
        day({ date: '2026-10-05' }),
        day({ date: '2026-10-06' }),
      ]),
      '2026-10-05'
    );

    expect(days.map((d) => d.isToday)).toEqual([false, true, false]);
    expect(days.map((d) => d.isFuture)).toEqual([false, false, true]);
  });

  it('carries the resolved preset name, not the bare enum', () => {
    const days = toWeekDays(
      response([
        day({ dayType: 'CUSTOM' as DayType, dayTypeName: 'Placement', dayTypeColor: '#f59e0b' }),
      ]),
      '2026-10-05'
    );

    expect(days[0]?.dayTypeName).toBe('Placement');
    expect(days[0]?.dayTypeColor).toBe('#f59e0b');
  });

  it('sorts into date order regardless of input order', () => {
    const days = toWeekDays(
      response([day({ date: '2026-10-07' }), day({ date: '2026-10-05' }), day({ date: '2026-10-06' })]),
      '2026-10-05'
    );

    expect(days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('returns nothing for a null response', () => {
    expect(toWeekDays(null, '2026-10-05')).toEqual([]);
  });
});

describe('weekAverage', () => {
  it('excludes days with nothing tracked', () => {
    /*
     * A week where the user tracked two days and scheduled nothing on the rest.
     * Averaging the 0s in would report 20% instead of 50% and would read as a bad
     * week rather than a week with two tracked days in it.
     */
    const average = weekAverage(
      response([
        day({ total: 4, completed: 2, completionRate: 50 }),
        day({ total: 0, completed: 0, completionRate: 0 }),
        day({ total: 4, completed: 2, completionRate: 50 }),
        day({ total: 0, completed: 0, completionRate: 0 }),
        day({ total: 0, completed: 0, completionRate: 0 }),
      ])
    );

    expect(average).toBe(50);
  });

  it('is null — not 0 — when the week has nothing tracked', () => {
    const average = weekAverage(
      response([day({ total: 0, completed: 0, completionRate: 0 })])
    );

    expect(average).toBeNull();
  });

  it('is null for a null response', () => {
    expect(weekAverage(null)).toBeNull();
  });
});

describe('rollupByDayType', () => {
  it('groups by the preset name, so custom presets stay distinct', () => {
    /*
     * The reason this groups on `dayTypeName`: every user-defined preset has
     * `dayType === 'CUSTOM'`, so grouping on the enum would merge College,
     * Placement and Exam Day into one row and average three different schedules
     * into a number that means nothing.
     */
    const rollups = rollupByDayType(
      response([
        day({ dayType: 'CUSTOM' as DayType, dayTypeName: 'College', completionRate: 80, total: 5, completed: 4 }),
        day({ dayType: 'CUSTOM' as DayType, dayTypeName: 'Placement', completionRate: 40, total: 5, completed: 2 }),
        day({ dayType: 'CUSTOM' as DayType, dayTypeName: 'College', completionRate: 60, total: 5, completed: 3 }),
      ])
    );

    expect(rollups).toHaveLength(2);
    expect(rollups.map((r) => r.dayTypeName).sort()).toEqual(['College', 'Placement']);
    // 80 and 60 average to 70.
    expect(rollups.find((r) => r.dayTypeName === 'College')?.averageCompletionRate).toBe(70);
  });

  it('excludes days with nothing tracked from a preset average', () => {
    const rollups = rollupByDayType(
      response([
        day({ dayTypeName: 'Workday', completionRate: 100, total: 4, completed: 4 }),
        day({ dayTypeName: 'Workday', total: 0, completed: 0, completionRate: 0 }),
      ])
    );

    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.averageCompletionRate).toBe(100);
    expect(rollups[0]?.daysRated).toBe(1);
  });

  it('sorts best rate first', () => {
    const rollups = rollupByDayType(
      response([
        day({ dayTypeName: 'Weekend', completionRate: 40 }),
        day({ dayTypeName: 'Workday', completionRate: 90 }),
        day({ dayTypeName: 'Exam Day', completionRate: 65 }),
      ])
    );

    expect(rollups.map((r) => r.dayTypeName)).toEqual(['Workday', 'Exam Day', 'Weekend']);
  });

  it('is empty when nothing in the range was tracked', () => {
    // So the caller renders "not enough data yet" rather than a row of zeros.
    const rollups = rollupByDayType(
      response([day({ total: 0, completed: 0, completionRate: 0 })])
    );

    expect(rollups).toEqual([]);
  });

  it('accumulates completed and total across the days of a preset', () => {
    const rollups = rollupByDayType(
      response([
        day({ dayTypeName: 'College', completionRate: 100, total: 4, completed: 4 }),
        day({ dayTypeName: 'College', completionRate: 50, total: 4, completed: 2 }),
      ])
    );

    expect(rollups[0]?.completed).toBe(6);
    expect(rollups[0]?.total).toBe(8);
    expect(rollups[0]?.daysRated).toBe(2);
  });
});
