import { describe, it, expect } from 'vitest';
import {
  buildFreshness,
  buildScoreAverage,
  type DailyScoreRowLike,
} from '@/lib/analytics/score-average';

/**
 * These two functions had two real bugs that were untestable while they lived
 * inside `AnalyticsService`, because that module reaches `@/lib/prisma`:
 *
 *  - `daysScored` was hardcoded to 7 for a week and 1 for a month regardless of
 *    what was scored, and it is the number the "out of N days" phrasing is built
 *    from.
 *  - `core` / `growth` / `bonus` were `null` for a month and a year, so the two
 *    longest tabs showed three permanent dashes.
 *
 * Every case below is one of those, or the `null`-is-not-`0` rule that the rest of
 * the codebase depends on (see `AGENTS.md`: unknown is not failed).
 */

function row(partial: Partial<DailyScoreRowLike>): DailyScoreRowLike {
  return {
    totalScore: null,
    coreScore: null,
    growthScore: null,
    bonusScore: null,
    ...partial,
  };
}

describe('buildScoreAverage', () => {
  it('returns all nulls and a zero count for no rows', () => {
    expect(buildScoreAverage([])).toEqual({
      average: null,
      core: null,
      growth: null,
      bonus: null,
      daysScored: 0,
    });
  });

  it('returns all nulls when every row is unscored', () => {
    const rows = [row({}), row({}), row({})];
    const result = buildScoreAverage(rows);
    expect(result.average).toBeNull();
    expect(result.daysScored).toBe(0);
  });

  it('averages a single day without dividing by the period length', () => {
    const result = buildScoreAverage([
      row({ totalScore: 84, coreScore: 90, growthScore: 70, bonusScore: 60 }),
    ]);
    expect(result.average).toBe(84);
    expect(result.core).toBe(90);
    expect(result.daysScored).toBe(1);
  });

  it('counts real scored days rather than the length of the period', () => {
    // The bug: a week reported 7 and a month reported 1. Three scored days in a
    // seven-day week must report three, because that is what the average is over.
    const rows = [
      row({ totalScore: 60 }),
      row({ totalScore: 80 }),
      row({ totalScore: 100 }),
      row({}),
      row({}),
      row({}),
      row({}),
    ];
    const result = buildScoreAverage(rows);
    expect(result.daysScored).toBe(3);
    expect(result.average).toBe(80);
  });

  it('excludes unscored rows from the average', () => {
    const withNulls = buildScoreAverage([
      row({ totalScore: 50 }),
      row({ totalScore: null }),
      row({ totalScore: 90 }),
    ]);
    // 50 + 90 over two rows, not over three — a null total is not a zero.
    expect(withNulls.average).toBe(70);
    expect(withNulls.daysScored).toBe(2);
  });

  it('populates core, growth and bonus for a long period', () => {
    // The bug: these were hardcoded null for month and year, so the two longest
    // tabs showed three permanent dashes on the breakdown users want most there.
    const rows = [
      row({ totalScore: 80, coreScore: 90, growthScore: 60, bonusScore: 40 }),
      row({ totalScore: 60, coreScore: 70, growthScore: 50, bonusScore: 30 }),
    ];
    const result = buildScoreAverage(rows);
    expect(result.core).toBe(80);
    expect(result.growth).toBe(55);
    expect(result.bonus).toBe(35);
  });

  it('averages a score column only over the rows that have it', () => {
    // A day with no growth measurement must not drag the growth average to zero.
    const result = buildScoreAverage([
      row({ totalScore: 80, coreScore: 90, growthScore: 70, bonusScore: 50 }),
      row({ totalScore: 60, coreScore: 70 }),
    ]);
    expect(result.core).toBe(80);
    expect(result.growth).toBe(70);
    expect(result.bonus).toBe(50);
  });

  it('keeps a column null when no row has it, rather than reporting 0', () => {
    const result = buildScoreAverage([
      row({ totalScore: 80, coreScore: 90 }),
      row({ totalScore: 60, coreScore: 70 }),
    ]);
    // Not 0. Nobody recorded a bonus score; that is unmeasured, not zero.
    expect(result.growth).toBeNull();
    expect(result.bonus).toBeNull();
    expect(result.core).toBe(80);
  });

  it('rounds the average to one decimal', () => {
    const result = buildScoreAverage([row({ totalScore: 80 }), row({ totalScore: 81 })]);
    expect(result.average).toBe(80.5);
  });

  it('gives the same answer for the same rows regardless of order', () => {
    // The one property that makes a single derivation safe to share across four
    // tabs: no dependence on row order.
    const rows = [
      row({ totalScore: 10, coreScore: 20 }),
      row({ totalScore: 90, coreScore: 40 }),
      row({ totalScore: 50, coreScore: 30 }),
    ];
    const forwards = buildScoreAverage(rows);
    const backwards = buildScoreAverage([...rows].reverse());
    expect(forwards).toEqual(backwards);
    expect(forwards.average).toBe(50);
    expect(forwards.core).toBe(30);
  });
});

describe('buildFreshness', () => {
  const range = { start: '2026-01-01', end: '2026-01-31' };

  it('reports nothing missing when every elapsed day is scored', () => {
    const result = buildFreshness(range, '2026-01-15', '2026-01-15', 15);
    expect(result.elapsedDays).toBe(15);
    expect(result.unscoredDays).toBe(0);
  });

  it('counts only elapsed days of a part-lived period', () => {
    // Fifteen of January has happened; the chip must not claim sixteen.
    const result = buildFreshness(range, '2026-01-15', '2026-01-14', 14);
    expect(result.elapsedDays).toBe(15);
    expect(result.unscoredDays).toBe(1);
  });

  it('counts the whole range once the period is complete', () => {
    const result = buildFreshness(range, '2026-02-05', '2026-01-31', 31);
    expect(result.elapsedDays).toBe(31);
    expect(result.unscoredDays).toBe(0);
  });

  it('reports the newest score date it was given', () => {
    expect(buildFreshness(range, '2026-01-15', '2026-01-14', 14).latestScoredDate).toBe(
      '2026-01-14'
    );
  });

  it('reports a null latest date for an account with no scores at all', () => {
    const result = buildFreshness(range, '2026-01-15', null, 0);
    expect(result.latestScoredDate).toBeNull();
    // Nothing scored anywhere: there is no job to be behind on, so the chip stays
    // hidden and the hero's empty state carries the message instead.
    expect(result.unscoredDays).toBe(0);
  });

  it('reports nothing for today before the nightly job has run', () => {
    // The cron fires at 01:00, so the current day legitimately has no score for
    // most of every day. A warning chip on the default tab, every morning, would be
    // noise about the normal case — and the hero's dashed "No score recorded" ring
    // already says it honestly.
    const result = buildFreshness(
      { start: '2026-01-15', end: '2026-01-15' },
      '2026-01-15',
      '2026-01-14', // yesterday scored, today not yet
      0
    );
    expect(result.unscoredDays).toBe(0);
  });

  it('reports a lag once the job has caught up inside the period', () => {
    // Same day, but the job has since run — so today's absence is a lag, not the
    // normal overnight wait, and the chip is the right answer.
    const result = buildFreshness(
      { start: '2026-01-15', end: '2026-01-15' },
      '2026-01-15',
      '2026-01-15',
      0
    );
    expect(result.elapsedDays).toBe(1);
    expect(result.unscoredDays).toBe(1);
  });

  it('reports nothing missing for a period entirely in the future', () => {
    // A day that has not happened has not been missed.
    const result = buildFreshness(
      { start: '2026-03-01', end: '2026-03-31' },
      '2026-01-15',
      '2026-01-14',
      0
    );
    expect(result.elapsedDays).toBe(0);
    expect(result.unscoredDays).toBe(0);
  });

  it('reports nothing missing for a period before the account existed', () => {
    // Those days will never be computed, so warning about them would put the chip
    // on every historical period the user browses back to.
    const result = buildFreshness(
      { start: '2025-01-01', end: '2025-01-31' },
      '2026-01-15',
      '2026-01-14',
      0
    );
    expect(result.unscoredDays).toBe(0);
  });

  it('still reports a lag for a part-scored period before the account existed', () => {
    // One score inside the old month means rows exist here, so the remaining
    // elapsed days are the job's to catch up on and the chip is meaningful.
    const result = buildFreshness(
      { start: '2025-01-01', end: '2025-01-31' },
      '2026-01-15',
      '2025-01-04',
      4
    );
    expect(result.elapsedDays).toBe(31);
    expect(result.unscoredDays).toBe(27);
  });

  it('counts a single elapsed day when the period is one day long', () => {
    const result = buildFreshness(
      { start: '2026-01-15', end: '2026-01-15' },
      '2026-01-20',
      '2026-01-15',
      0
    );
    expect(result.elapsedDays).toBe(1);
    expect(result.unscoredDays).toBe(1);
  });

  it('never reports a negative count of unscored days', () => {
    // A retroactive edit or a timezone shift can leave more scored rows in range
    // than elapsed days. "-3 days not scored" is not a sentence anyone should read.
    const result = buildFreshness(range, '2026-01-10', '2026-01-10', 31);
    expect(result.elapsedDays).toBe(10);
    expect(result.unscoredDays).toBe(0);
  });

  it('treats a single-day period as one elapsed day', () => {
    const result = buildFreshness(
      { start: '2026-01-15', end: '2026-01-15' },
      '2026-01-15',
      '2026-01-15',
      0
    );
    expect(result.elapsedDays).toBe(1);
    expect(result.unscoredDays).toBe(1);
  });

  it('counts a single-day period in the past as complete once scored', () => {
    const result = buildFreshness(
      { start: '2026-01-15', end: '2026-01-15' },
      '2026-01-20',
      '2026-01-15',
      1
    );
    expect(result.elapsedDays).toBe(1);
    expect(result.unscoredDays).toBe(0);
  });

  it('spans a month boundary correctly', () => {
    // 28 January to 2 February is six days inclusive, and the off-by-one here is
    // what decides whether the chip undercounts or overcounts by a day.
    const result = buildFreshness(
      { start: '2026-01-28', end: '2026-02-02' },
      '2026-02-02',
      '2026-02-01',
      5
    );
    expect(result.elapsedDays).toBe(6);
    expect(result.unscoredDays).toBe(1);
  });
});
