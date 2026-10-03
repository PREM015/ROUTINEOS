import { describe, expect, it } from 'vitest';
import {
  buildMonthView,
  buildYearView,
  computeStats,
  isoWeekdayOf,
  weekdayOf,
  yearsInWindow,
  type ContributionDay,
} from '@/lib/dashboard/contributions';

/**
 * Consistency card layout geometry.
 *
 * Two views over one dataset: a GitHub-style week-column graph and a
 * LeetCode-style month calendar. The invariant under test throughout:
 *
 * > `null` is not zero. It means "no stored score for that date".
 *
 * A grid that conflates the two is worse than no grid, because a fabricated
 * low-intensity block reads as a bad week and a missing day reads as a failure.
 */

function day(date: string, score: number | null): ContributionDay {
  const level =
    score === null ? 0 : score >= 90 ? 4 : score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0;
  return { date, score, level };
}

function mapOf(entries: [string, number | null][]): Map<string, ContributionDay> {
  return new Map(entries.map(([date, score]) => [date, day(date, score)]));
}

describe('weekdayOf / isoWeekdayOf', () => {
  it('reads the calendar date at UTC midnight, not a local instant', () => {
    // 2026-10-04 is a Sunday. Parsing this as local midnight and formatting back
    // in a zone behind UTC renders the previous day, which is how every user's
    // Sundays used to resolve as Saturdays.
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(weekdayOf('2026-10-10')).toBe(6);
  });

  it('folds Sunday to 7 in the ISO form and leaves it alone otherwise', () => {
    expect(isoWeekdayOf('2026-10-04')).toBe(7);
    expect(isoWeekdayOf('2026-10-05')).toBe(1);
    expect(isoWeekdayOf('2026-10-10')).toBe(6);
  });
});

describe('buildYearView', () => {
  const YEAR = 2026;
  const TODAY = '2026-10-05';
  const realCells = (view: { weeks: ContributionDay[][]; padding: Set<string> }) =>
    view.weeks.flat().filter((c) => !view.padding.has(c.date));

  it('renders the WHOLE year even when there is no data at all', () => {
    /*
      The regression this pins. `buildYearView` used to span `dates[0]..dates[last]`
      - the keys actually in the map - so a user with one logged day got a
      one-week grid inside a full-size card, and every "huge empty black space"
      report was this single line rather than any CSS problem.
    */
    const view = buildYearView(new Map(), YEAR, TODAY);
    expect(realCells(view)).toHaveLength(365);
    expect(view.weeks).toHaveLength(53);
    expect(realCells(view).every((c) => c.score === null)).toBe(true);
  });

  it('renders 365 days for a single entry just the same', () => {
    const view = buildYearView(mapOf([['2026-10-05', 70]]), YEAR, TODAY);
    expect(realCells(view)).toHaveLength(365);
    const scored = realCells(view).filter((c) => c.score !== null);
    expect(scored).toHaveLength(1);
  });

  it('covers 1 Jan to 31 Dec with no gap and no repeat', () => {
    const view = buildYearView(mapOf([['2026-06-15', 50]]), YEAR, TODAY);
    const dates = realCells(view).map((c) => c.date);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates[dates.length - 1]).toBe('2026-12-31');
    expect(new Set(dates).size).toBe(365);
  });

  it('pads the first column so every column is weekday-aligned', () => {
    // 2026-01-01 is a Thursday, so four pad cells precede it.
    const view = buildYearView(new Map(), YEAR, TODAY);
    expect(weekdayOf('2026-01-01')).toBe(4);
    expect(view.padding.size).toBe(4);
    expect(view.weeks[0]?.[4]?.date).toBe('2026-01-01');
  });

  it('pads nothing when 1 January is already a Sunday', () => {
    const view = buildYearView(new Map(), 2023, '2023-06-01');
    expect(weekdayOf('2023-01-01')).toBe(0);
    expect(view.padding.size).toBe(0);
    expect(view.weeks[0]?.[0]?.date).toBe('2023-01-01');
  });

  it('produces columns of exactly 7 apart from a short final column', () => {
    const view = buildYearView(new Map(), YEAR, TODAY);
    expect(view.weeks.slice(0, -1).every((w) => w.length === 7)).toBe(true);
    expect(view.weeks[view.weeks.length - 1]?.length).toBeLessThan(7);
  });

  it('keeps the row index equal to the weekday for every real day', () => {
    const view = buildYearView(new Map(), YEAR, TODAY);
    for (const week of view.weeks) {
      week.forEach((cell, row) => {
        if (view.padding.has(cell.date)) return;
        // The alignment claim, asserted: row === weekday, for all 365 days.
        expect(row).toBe(weekdayOf(cell.date));
      });
    }
  });

  it('leaves an absent day as null rather than a zero', () => {
    // Two real days with a gap between them: the gap must not become a scored 0.
    const view = buildYearView(
      mapOf([
        ['2026-10-04', 80],
        ['2026-10-07', 90],
      ]),
      YEAR,
      TODAY
    );
    const scored = realCells(view).filter((c) => c.score !== null);
    expect(scored.map((c) => c.score)).toEqual([80, 90]);
    // The two gaps between them stay null, not 0.
    const between = realCells(view).filter(
      (c) => c.date === '2026-10-05' || c.date === '2026-10-06'
    );
    expect(between.map((c) => c.score)).toEqual([null, null]);
  });

  it('marks days after today as future, including ones present in the map', () => {
    const view = buildYearView(mapOf([['2026-10-04', 80]]), YEAR, TODAY);
    const real = realCells(view);
    expect(real.find((c) => c.date === '2026-10-04')?.future).toBe(false);
    expect(real.find((c) => c.date === '2026-10-05')?.future).toBe(false);
    expect(real.find((c) => c.date === '2026-10-06')?.future).toBe(true);
    expect(real.find((c) => c.date === '2026-12-31')?.future).toBe(true);
  });

  it('derives pad and future even though the wire type omits them', () => {
    /*
      The API sends `{ date, score, level }`. If those flags were trusted from the
      fetched row a day could reach the grid with `future === undefined`, i.e.
      drawn as a normal past day.
    */
    const view = buildYearView(mapOf([['2026-12-25', 99]]), YEAR, TODAY);
    const dec25 = realCells(view).find((c) => c.date === '2026-12-25');
    expect(dec25?.future).toBe(true);
    expect(dec25?.pad).toBe(false);
    expect(dec25?.score).toBe(99);
  });
});

describe('buildMonthView', () => {
  it('places day 1 in the row for its own weekday', () => {
    // 2026-10-01 is a Thursday -> ISO 4, so three leading blanks.
    const { months } = buildMonthView(mapOf([['2026-10-01', 70]]), 2026);
    const october = months[9];
    expect(october?.key).toBe('2026-10');
    expect(october?.grid[3]?.[0]?.date).toBe('2026-10-01');
    expect(october?.grid[0]?.[0]).toBeNull();
    expect(october?.grid[1]?.[0]).toBeNull();
    expect(october?.grid[2]?.[0]).toBeNull();
  });

  it('gives every month exactly its own number of days', () => {
    const { months } = buildMonthView(new Map(), 2026);
    const lengths = months.map((m) => m.daysInMonth);
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it('handles a leap February', () => {
    const { months } = buildMonthView(new Map(), 2028);
    expect(months[1]?.daysInMonth).toBe(29);
  });

  it('leaves gaps for days a month does not have', () => {
    /*
      January 2026: the 1st is a Thursday, so 3 leading blanks, then 31 days =
      34 slots, which fills 5 columns (35 slots). Exactly one cell in the final
      column is real and four are gaps. Tinting those four would invent four days
      in every month.
    */
    const { months } = buildMonthView(new Map(), 2026);
    const january = months[0];
    const filled = january?.grid.flat().filter((c) => c !== null) ?? [];
    expect(filled).toHaveLength(31);
    // 5 columns x 7 rows = 35 slots for 31 real days.
    expect((january?.grid[0]?.length ?? 0) * 7 - filled.length).toBe(4);
  });

  it('never emits a duplicate date, which a wrong column count would cause', () => {
    const entries = Array.from({ length: 31 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      return [d, 60] as [string, number];
    });
    const { months } = buildMonthView(mapOf(entries), 2026);
    const dates = months[9]?.grid.flat().filter((c) => c !== null).map((c) => c?.date) ?? [];
    expect(new Set(dates).size).toBe(31);
  });

  it('counts only days that actually have a score', () => {
    const { months } = buildMonthView(
      mapOf([
        ['2026-10-01', 70],
        ['2026-10-02', null],
        ['2026-10-03', 90],
      ]),
      2026
    );
    expect(months[9]?.activeDays).toBe(2);
  });

  it('emits all twelve months even with no data', () => {
    expect(buildMonthView(new Map(), 2026).months).toHaveLength(12);
  });
});

describe('computeStats', () => {
  it('counts only scored days', () => {
    const stats = computeStats(
      mapOf([
        ['2026-03-02', 80],
        ['2026-03-03', null],
        ['2026-03-04', 90],
      ]),
      2026,
      '2026-03-10'
    );
    // Jan 31 + Feb 28 + Mar 10 = 69 days elapsed; only 2 of them were scored.
    expect(stats.activeDays).toBe(2);
    expect(stats.totalDays).toBe(69);
  });

  it('terminates on a dataset that is mostly gaps', () => {
    /*
      A regression guard, not a style test. The current-streak walk used to read
      `byDate.get(cursor)?.score !== null`, and optional chaining yields
      `undefined` for a date that is not in the map - which is *not* null, so the
      loop walked backwards off the end of the dataset forever. The dense map made
      this easy to hit because most dates in the window are gaps.
    */
    const entries: [string, number | null][] = [
      ['2026-03-09', 60],
      // March 1-8 and 10 are absent from the map entirely.
    ];
    const stats = computeStats(mapOf(entries), 2026, '2026-03-10');
    expect(stats.currentStreak).toBe(1);
  });

  it('finds the longest run of consecutive scored days', () => {
    const stats = computeStats(
      mapOf([
        ['2026-03-01', 50],
        ['2026-03-02', 50],
        ['2026-03-03', 50],
        ['2026-03-04', 50],
        ['2026-03-09', 50],
      ]),
      2026,
      '2026-03-10'
    );
    expect(stats.longestStreak).toBe(4);
  });

  it('breaks a run across an unscored day', () => {
    const stats = computeStats(
      mapOf([
        ['2026-03-01', 50],
        ['2026-03-02', 50],
        // March 3 never scored.
        ['2026-03-04', 50],
        ['2026-03-05', 50],
        ['2026-03-06', 50],
      ]),
      2026,
      '2026-03-10'
    );
    expect(stats.longestStreak).toBe(3);
  });

  it('counts a run that ended yesterday as the current streak', () => {
    // A run that ended yesterday is still a run; it simply is not current today,
    // and the grid shows the gap on its own.
    const stats = computeStats(
      mapOf([
        ['2026-03-08', 50],
        ['2026-03-09', 50],
      ]),
      2026,
      '2026-03-10'
    );
    expect(stats.currentStreak).toBe(2);
  });

  it('reports zero streak rather than throwing when nothing was scored', () => {
    const stats = computeStats(new Map(), 2026, '2026-03-10');
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.activeDays).toBe(0);
    expect(stats.bestWeekday).toBeNull();
  });

  it('only names a weekday with at least 3 scored days behind it', () => {
    // Two Tuesdays cannot establish a pattern.
    const thin = computeStats(
      mapOf([
        ['2026-03-03', 95],
        ['2026-03-10', 95],
      ]),
      2026,
      '2026-03-11'
    );
    expect(thin.bestWeekday).toBeNull();

    const solid = computeStats(
      mapOf([
        ['2026-03-03', 95],
        ['2026-03-10', 95],
        ['2026-03-17', 95],
      ]),
      2026,
      '2026-03-18'
    );
    expect(solid.bestWeekday).toBe('Tuesdays');
  });

  it('excludes other calendar years from the stats', () => {
    const stats = computeStats(
      mapOf([
        ['2025-12-31', 99],
        ['2026-01-01', 60],
      ]),
      2026,
      '2026-01-02'
    );
    expect(stats.activeDays).toBe(1);
  });

  it('does not imply a full year when the year is still in progress', () => {
    // February 2026: the 60th day of the year is March 1.
    const stats = computeStats(new Map(), 2026, '2026-01-01');
    expect(stats.totalDays).toBe(1);
  });

  it('counts a completed year as a full 365', () => {
    expect(computeStats(new Map(), 2025, '2026-03-01').totalDays).toBe(365);
  });
});

describe('yearsInWindow', () => {
  it('lists calendar years newest first, deduplicated', () => {
    expect(
      yearsInWindow(
        mapOf([
          ['2025-06-01', 50],
          ['2026-01-01', 50],
          ['2026-07-01', 50],
        ])
      )
    ).toEqual([2026, 2025]);
  });

  it('returns nothing for an empty map', () => {
    expect(yearsInWindow(new Map())).toEqual([]);
  });
});
