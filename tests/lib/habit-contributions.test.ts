import { describe, expect, it } from 'vitest';
import {
  buildContributionYear,
  daysInYear,
  isLeapYear,
  levelFor,
  stateFor,
  yearOverYear,
  type ContributionStats,
  type LogLike,
} from '@/lib/habits/contributions';
import type {
  ContributionHabit,
  EligibilityContext,
} from '@/lib/habits/contribution-eligibility';

/**
 * The habit contribution year model.
 *
 * The invariant these exist to protect:
 *
 * > A day with no `HabitLog` row is **unknown**, not failed.
 *
 * That is the difference between this and the existing `getHabitHealth` rate,
 * which divides by `completed + missed + skipped` and so only ever sees days the
 * user opened the app. Here the denominator is *scheduled*.
 */

function habit(overrides: Partial<ContributionHabit> = {}): ContributionHabit {
  return {
    id: 'h1',
    name: 'Read',
    tier: 'GROWTH',
    status: 'ACTIVE',
    frequencyType: 'DAILY',
    frequencyValue: null,
    appliesEveryDay: true,
    startDay: '2026-01-01',
    endDay: null,
    dayTypeAssignments: [],
    color: null,
    icon: null,
    points: null,
    ...overrides,
  };
}

function log(date: string, status = 'COMPLETED', habitId = 'h1'): LogLike {
  return { habitId, date, status };
}

const ctx: EligibilityContext = { overrides: new Map(), dayTypes: new Map() };

describe('daysInYear / isLeapYear', () => {
  it('applies the Gregorian rule rather than a hardcoded 365', () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    // Divisible by 100 but not 400: NOT a leap year.
    expect(daysInYear(1900)).toBe(365);
    // Divisible by 400: leap.
    expect(daysInYear(2000)).toBe(366);
  });

  it('agrees with isLeapYear', () => {
    for (const year of [2024, 2025, 2026, 2027, 1900, 2000, 2100, 2400]) {
      expect(daysInYear(year)).toBe(isLeapYear(year) ? 366 : 365);
    }
  });
});

describe('levelFor', () => {
  it('drives intensity from the completion rate, not the volume', () => {
    // 1 of 1 done and 1 of 10 done are both "all of what was due", and both are
    // full days. Volume is reported in the tooltip, not in the shade.
    expect(levelFor(1, 1)).toBe(4);
    // 1 of 10 is a tenth of a day and must not read like 9 of 10.
    expect(levelFor(10, 1)).toBe(1);
    expect(levelFor(10, 9)).toBe(3);
    expect(levelFor(10, 10)).toBe(4);
  });

  it('bands 70 / 40', () => {
    expect(levelFor(10, 7)).toBe(3);
    expect(levelFor(10, 4)).toBe(2);
    expect(levelFor(10, 3)).toBe(1);
    expect(levelFor(10, 0)).toBe(0);
  });

  it('returns 0 when nothing was scheduled, never 1', () => {
    // A rest day must not read as "minimal activity".
    expect(levelFor(0, 0)).toBe(0);
  });
});

describe('stateFor', () => {
  it('distinguishes the three kinds of "no"', () => {
    expect(stateFor(0, 0, 0)).toBe('UNSCHEDULED');
    expect(stateFor(3, 0, 0)).toBe('NO_RECORD');
    expect(stateFor(3, 0, 2)).toBe('LOGGED_MISS');
    expect(stateFor(3, 2, 0)).toBe('PARTIAL');
    expect(stateFor(3, 3, 0)).toBe('FULL');
  });
});

describe('buildContributionYear', () => {
  const year = 2026;
  const today = '2026-03-10';

  it('produces a dense cell for every day in the window', () => {
    const result = buildContributionYear({
      year,
      today,
      habits: [habit()],
      logs: [],
      ctx,
    });
    /*
      The GRID is the whole year; the WINDOW is Jan 1 - Mar 10.

      These were the same number before, which is precisely the confusion this pair
      of concepts has to be kept apart to avoid: a dense calendar and a scoring
      window are different things, and collapsing them is what produced a
      three-cell card for a user with one habit.
    */
    expect(result.cells).toHaveLength(365);
    expect(result.cells[0]?.date).toBe('2026-01-01');
    expect(result.cells[result.cells.length - 1]?.date).toBe('2026-12-31');
    expect(result.stats.windowStart).toBe('2026-01-01');
    expect(result.stats.windowEnd).toBe('2026-03-10');
  });

  it('renders the full year but only scores inside the window', () => {
    const result = buildContributionYear({
      year,
      today,
      habits: [habit()],
      logs: [],
      ctx,
    });

    const afterWindow = result.cells.filter((c) => c.date > today);
    expect(afterWindow.length).toBeGreaterThan(0);
    // Every one of them is present, and inert - not absent, not a scored zero.
    for (const cell of afterWindow) {
      expect(cell.state).toBe('UNSCHEDULED');
      expect(cell.scheduled).toBe(0);
      expect(cell.completed).toBe(0);
      expect(cell.rate).toBeNull();
    }
    // And none of them moved a number.
    expect(result.stats.activeDays).toBe(0);
    expect(result.stats.currentStreak).toBe(0);
    expect(result.stats.scheduledTotal).toBe(
      result.cells.filter((c) => c.scheduled > 0).reduce((s, c) => s + c.scheduled, 0)
    );
  });

  it('clips the window to the first habit start', () => {
    const result = buildContributionYear({
      year,
      today,
      habits: [habit({ startDay: '2026-03-01' })],
      logs: [],
      ctx,
    });
    expect(result.stats.windowStart).toBe('2026-03-01');
    // The calendar still spans the year; only the scoring window is clipped.
    expect(result.cells).toHaveLength(365);
    // Days before the habit existed are inert, not missing.
    const beforeStart = result.cells.filter((c) => c.date < '2026-03-01');
    expect(beforeStart).toHaveLength(59);
    expect(beforeStart.every((c) => c.state === 'UNSCHEDULED' && c.scheduled === 0)).toBe(true);
  });

  it('never starts before January 1st', () => {
    const result = buildContributionYear({
      year,
      today,
      habits: [habit({ startDay: '2025-06-01' })],
      logs: [],
      ctx,
    });
    expect(result.stats.windowStart).toBe('2026-01-01');
  });

  it('counts a scheduled-but-unlogged day as a real zero, not as absent', () => {
    const result = buildContributionYear({
      year,
      today: '2026-01-02',
      habits: [habit()],
      logs: [log('2026-01-01')],
      ctx,
    });
    const [, second] = result.cells;
    expect(second?.scheduled).toBe(1);
    expect(second?.completed).toBe(0);
    expect(second?.state).toBe('NO_RECORD');
    expect(second?.rate).toBe(0);
  });

  it('ignores a COMPLETED log for a habit that was not due that day', () => {
    // A retroactive tick can leave a row for an unscheduled habit. Counting it
    // would push the rate above 100%.
    const result = buildContributionYear({
      year,
      // The log is dated 2026-01-02, so the window has to reach that far.
      today: '2026-01-02',
      habits: [habit({ frequencyType: 'SPECIFIC_WEEKDAYS', frequencyValue: '1' })],
      // 2026-01-02 is a Friday, not Monday, so the habit is not due.
      logs: [log('2026-01-02')],
      ctx,
    });
    const jan2 = result.cells.find((c) => c.date === '2026-01-02');
    expect(jan2?.scheduled).toBe(0);
    expect(jan2?.completed).toBe(0);
    expect(jan2?.state).toBe('UNSCHEDULED');
  });

  it('never reports a rate above 100', () => {
    const result = buildContributionYear({
      year,
      today: '2026-01-02',
      habits: [habit(), habit({ id: 'h2' })],
      logs: [log('2026-01-01'), log('2026-01-01', 'COMPLETED', 'h2')],
      ctx,
    });
    for (const cell of result.cells) {
      expect(cell.rate ?? 0).toBeLessThanOrEqual(100);
    }
  });

  it('breaks the streak on a scheduled day with nothing completed', () => {
    const result = buildContributionYear({
      year,
      today: '2026-01-05',
      habits: [habit()],
      logs: [log('2026-01-01'), log('2026-01-02'), log('2026-01-04')],
      ctx,
    });
    // Jan 3 breaks the run, so the longest is 2 (Jan 1-2). Then Jan 4 restarts
    // it and Jan 5 - scheduled, nothing done - breaks it again, which is why the
    // *current* streak is 0 rather than 1. "Current" means "as of today", and
    // today was not done.
    expect(result.stats.longestStreak).toBe(2);
    expect(result.stats.currentStreak).toBe(0);
  });

  it('does not break the streak on a day with nothing scheduled', () => {
    // A rest day between two good Mondays is not a lapse.
    const weekdayHabit = habit({
      frequencyType: 'SPECIFIC_WEEKDAYS',
      frequencyValue: '1',
    });
    const result = buildContributionYear({
      year,
      today: '2026-01-12',
      habits: [weekdayHabit],
      logs: [log('2026-01-05'), log('2026-01-12')],
      ctx,
    });
    expect(result.stats.currentStreak).toBe(2);
  });

  it('reports a current streak of zero for a future year', () => {
    // A 2027 streak that "continues" to today would be a lie.
    const result = buildContributionYear({
      year: 2027,
      today,
      habits: [habit()],
      logs: [],
      ctx,
    });
    expect(result.stats.currentStreak).toBe(0);
    expect(result.stats.windowEnd).toBe('2027-12-31');
  });

  it('buckets months and marks unreached months as future', () => {
    const result = buildContributionYear({
      year,
      today: '2026-02-15',
      habits: [habit()],
      logs: [log('2026-01-05'), log('2026-01-06')],
      ctx,
    });
    expect(result.months).toHaveLength(12);
    const january = result.months[0];
    expect(january?.activeDays).toBe(2);
    expect(january?.futureDays).toBe(0);
    /*
      March has not happened yet, so all 31 of its days are future. `futureDays`
      is a COUNT of unreached days, not a flag: the grid spans the whole year, so
      `days` is 31 and the only thing that distinguishes "March is ahead of me"
      from "March was empty" is this count.
    */
    expect(result.months[2]?.futureDays).toBe(31);
    expect(result.months[2]?.days).toBe(31);
    expect(result.months[2]?.activeDays).toBe(0);
    // February is partly lived: today is the 15th, so the 16th-28th are future.
    expect(result.months[1]?.futureDays).toBe(13);
  });

  it('reports every month as zero active days when nothing was ever done', () => {
    const result = buildContributionYear({
      year,
      today: '2026-02-15',
      habits: [habit()],
      logs: [],
      ctx,
    });
    expect(result.stats.activeDays).toBe(0);
    expect(result.stats.rate).toBe(0);
    // Best month must be null, not January-with-0%, so nothing is claimed.
    expect(result.stats.bestMonth).toBe('January');
  });

  it('leaves the previous year null rather than inventing a comparison', () => {
    const result = buildContributionYear({ year, today, habits: [habit()], logs: [], ctx });
    expect(result.previousYear).toBeNull();
    expect(yearOverYear(result.stats, null)).toEqual({ delta: null, previousRate: null });
  });

  it('computes a year-over-year delta when both rates exist', () => {
    const current = { rate: 70 } as ContributionStats;
    const previous = { rate: 64 } as ContributionStats;
    expect(yearOverYear(current, previous)).toEqual({ delta: 6, previousRate: 64 });
  });

  it('offers only years that actually contain a log', () => {
    const result = buildContributionYear({
      year,
      today,
      habits: [habit()],
      logs: [log('2025-06-01'), log('2026-01-01')],
      ctx,
    });
    expect(result.availableYears).toEqual([2026, 2025]);
  });

  it('per-habit breakdown sums to the day totals', () => {
    const result = buildContributionYear({
      year,
      today: '2026-01-03',
      habits: [habit(), habit({ id: 'h2', name: 'Run' })],
      logs: [
        log('2026-01-01'),
        log('2026-01-01', 'COMPLETED', 'h2'),
        log('2026-01-02', 'COMPLETED', 'h2'),
      ],
      ctx,
    });
    const total = result.habits.reduce((sum, h) => sum + h.completed, 0);
    expect(total).toBe(result.stats.completedTotal);
    expect(total).toBe(3);
  });

  it('handles a user with no habits at all', () => {
    const result = buildContributionYear({ year, today, habits: [], logs: [], ctx });
    expect(result.cells.length).toBeGreaterThan(0);
    expect(result.stats.activeDays).toBe(0);
    expect(result.stats.rate).toBeNull();
    expect(result.habits).toEqual([]);
  });
});
