import { describe, expect, it } from 'vitest';
import {
  bucketByDayType,
  clampPercent,
  elapsedPercent,
  goalPace,
  meanOfPresent,
  type PaceGoal,
} from '@/lib/dashboard/derive';

/**
 * The dashboard's derivations.
 *
 * These matter more than most, because the rules here replaced heuristics that
 * were quietly wrong. `GoalsMetric` used to declare a goal "on track" by
 * comparing progress against a flat 40%-or-15% cut-off picked from days
 * remaining - a number that moved as the deadline approached without any progress
 * being logged. The pace rule below is what "on pace" actually claims, so it is
 * worth pinning down.
 */

function goal(overrides: Partial<PaceGoal> = {}): PaceGoal {
  return {
    id: 'g1',
    title: 'Read 10 books',
    status: 'ACTIVE',
    targetValue: 10,
    currentValue: 5,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    ...overrides,
  };
}

describe('elapsedPercent', () => {
  it('measures the fraction of the period that has passed', () => {
    // 2026-10-01 to 2026-10-31 is 30 days; 2026-10-16 is 15 days in.
    expect(elapsedPercent('2026-10-01', '2026-10-31', '2026-10-16')).toBeCloseTo(50, 5);
  });

  it('clamps to 0 before the goal has started', () => {
    // Negative elapsed would make `behind` negative and count a not-yet-started
    // goal as comfortably on pace, which is the bug class this replaced.
    expect(elapsedPercent('2026-10-10', '2026-10-31', '2026-10-01')).toBe(0);
  });

  it('clamps to 100 after the period has ended', () => {
    expect(elapsedPercent('2026-10-01', '2026-10-10', '2026-10-20')).toBe(100);
  });

  it('treats a zero-length or inverted period as fully elapsed', () => {
    expect(elapsedPercent('2026-10-01', '2026-10-01', '2026-10-01')).toBe(100);
    expect(elapsedPercent('2026-10-10', '2026-10-01', '2026-10-05')).toBe(100);
  });
});

describe('clampPercent', () => {
  it('holds both bounds', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(42)).toBe(42);
  });
});

describe('goalPace', () => {
  it('calls a goal on pace when progress matches elapsed time', () => {
    // Half the period gone, half the target done.
    const result = goalPace([goal()], '2026-10-16');
    expect(result.active).toBe(1);
    expect(result.onPace).toBe(1);
    expect(result.furthestBehind).toBeNull();
  });

  it('calls a goal behind when progress lags elapsed time', () => {
    // 50% of the period gone but only 10% of the target done.
    const result = goalPace([goal({ currentValue: 1 })], '2026-10-16');
    expect(result.onPace).toBe(0);
    expect(result.furthestBehind?.behindPctPoints).toBe(40);
  });

  it('tolerates a small lag inside the tolerance band', () => {
    // 50% elapsed, 45% done: 5 points behind, inside the 10-point tolerance.
    const result = goalPace([goal({ currentValue: 4.5 })], '2026-10-16');
    expect(result.onPace).toBe(1);
    expect(result.furthestBehind).toBeNull();
  });

  it('lets a goal that is ahead read as on pace', () => {
    const result = goalPace([goal({ currentValue: 8 })], '2026-10-16');
    expect(result.onPace).toBe(1);
    expect(result.furthestBehind).toBeNull();
  });

  it('treats a zero target as not started rather than dividing by zero', () => {
    const result = goalPace([goal({ targetValue: 0, currentValue: 0 })], '2026-10-16');
    expect(result.onPace).toBe(0);
    expect(result.furthestBehind?.behindPctPoints).toBe(50);
  });

  it('ignores goals that are not active or carried over', () => {
    const result = goalPace(
      [
        goal({ id: 'a', status: 'ACTIVE' }),
        goal({ id: 'b', status: 'COMPLETED' }),
        goal({ id: 'c', status: 'ARCHIVED' }),
        goal({ id: 'd', status: 'CARRIED_OVER' }),
      ],
      '2026-10-16'
    );
    expect(result.active).toBe(2);
    expect(result.onPace).toBe(2);
  });

  it('names the single furthest-behind goal, not all of them', () => {
    // 50% of the period elapsed, so "on pace" means >= 40% of the target done.
    const result = goalPace(
      [
        goal({ id: 'exactly-pace', title: 'A', currentValue: 4 }), // 40% -> on pace
        goal({ id: 'worst', title: 'B', currentValue: 1 }), // 10% -> furthest behind
        goal({ id: 'ahead', title: 'C', currentValue: 9 }), // 90% -> on pace
      ],
      '2026-10-16'
    );
    expect(result.onPace).toBe(2);
    expect(result.furthestBehind?.id).toBe('worst');
    expect(result.furthestBehind?.title).toBe('B');
  });

  it('never reports "0 points behind" - that would read as a rounding artefact', () => {
    // 50% elapsed, 40.5% done: 9.5 points behind, which rounds to 10, but a
    // goal 9.5 points behind must still report at least 1.
    const result = goalPace([goal({ currentValue: 4.05 })], '2026-10-16', 5);
    const worst = result.furthestBehind;
    expect(worst).not.toBeNull();
    expect(worst?.behindPctPoints ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('reports the 7-days-ago on-pace count as the comparison baseline', () => {
    // On 2026-10-16 the goal is dead on pace. A week earlier, 7/30 of the period
    // had gone and 50% was done - comfortably ahead - so the baseline must also
    // count it. This is what makes the dashboard's arrow mean "did the set get
    // healthier", not "did the clock move".
    const result = goalPace([goal()], '2026-10-16');
    expect(result.onPace).toBe(1);
    expect(result.previousOnPace).toBe(1);
  });

  it('shows a falling on-pace count when nothing was logged', () => {
    // Frozen at 60% of the target. A week ago 66.7% of the period had gone, so
    // the goal was comfortably on pace; seven days later 90% has gone and it is
    // 30 points behind. Holding progress still while the deadline closes IS
    // falling behind - that is the point of the rule.
    const result = goalPace([goal({ currentValue: 6 })], '2026-10-28');
    expect(result.previousOnPace).toBe(1);
    expect(result.onPace).toBe(0);
  });

  it('returns zeros rather than throwing for no goals', () => {
    expect(goalPace([], '2026-10-16')).toEqual({
      active: 0,
      onPace: 0,
      previousOnPace: 0,
      furthestBehind: null,
    });
  });
});

describe('meanOfPresent', () => {
  it('averages only the days that have data', () => {
    // Averaging nulls as zero would drag a 100 down to 33 and punish the user
    // for days they never logged.
    expect(meanOfPresent([100, null, 50])).toBe(75);
  });

  it('returns null, not zero, when nothing is present', () => {
    expect(meanOfPresent([null, null])).toBeNull();
    expect(meanOfPresent([])).toBeNull();
  });

  it('ignores non-finite values', () => {
    expect(meanOfPresent([60, Number.NaN, 40])).toBe(50);
  });
});

describe('bucketByDayType', () => {
  const definitions = [
    { id: 'd-work', slug: 'work-day', name: 'College' },
    { id: 'd-weekend', slug: 'weekend', name: 'Weekend' },
  ];

  it('groups by the user\'s own day-type names, not the enum', () => {
    const buckets = bucketByDayType(
      [
        { date: '2026-10-05', totalScore: 70 }, // Monday -> College
        { date: '2026-10-06', totalScore: 80 }, // Tuesday -> College
        { date: '2026-10-07', totalScore: 80 }, // Wednesday -> College
        { date: '2026-10-10', totalScore: 40 }, // Saturday -> Weekend
        { date: '2026-10-11', totalScore: 50 }, // Sunday -> Weekend
        { date: '2026-10-12', totalScore: 45 }, // Monday -> College
      ],
      definitions,
      []
    );

    const college = buckets.find((b) => b.dayTypeName === 'College');
    expect(college?.scoredDays).toBe(4);
    // Mon 70 + Tue 80 + Wed 80 + Mon 45 = 275 over 4 days.
    expect(college?.averageScore).toBe(69);

    // Sorted best-first, so the strongest bucket must lead.
    const [best, worst] = buckets;
    expect(best?.averageScore ?? 0).toBeGreaterThanOrEqual(worst?.averageScore ?? 0);
  });

  it('honours a routine exception over the natural weekday', () => {
    const buckets = bucketByDayType(
      [
        { date: '2026-10-05', totalScore: 90 }, // Monday, marked as Weekend
        { date: '2026-10-06', totalScore: 90 },
        { date: '2026-10-07', totalScore: 90 },
      ],
      definitions,
      [{ date: '2026-10-05', dayTypeId: 'd-weekend', dayType: 'WEEKEND' }]
    );

    expect(buckets.find((b) => b.dayTypeName === 'Weekend')?.scoredDays).toBe(1);
    expect(buckets.find((b) => b.dayTypeName === 'College')?.scoredDays).toBe(2);
  });

  it('skips unscored days entirely rather than bucketing them as zero', () => {
    const buckets = bucketByDayType(
      [
        { date: '2026-10-05', totalScore: 80 },
        { date: '2026-10-06', totalScore: null },
        { date: '2026-10-07', totalScore: null },
      ],
      definitions,
      []
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.scoredDays).toBe(1);
    expect(buckets[0]?.averageScore).toBe(80);
  });

  it('falls back to the enum when the user has no matching definition', () => {
    const buckets = bucketByDayType([{ date: '2026-10-05', totalScore: 60 }], [], []);
    expect(buckets[0]?.dayTypeName).toBe('WORKDAY');
  });

  it('returns nothing when there are no scored days', () => {
    expect(bucketByDayType([{ date: '2026-10-05', totalScore: null }], definitions, [])).toEqual([]);
  });
});
