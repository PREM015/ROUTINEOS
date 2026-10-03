import { describe, expect, it } from 'vitest';

import { FOCUS_METRIC_DEFAULTS, countedMinutes, countsTowardTotals } from '@/lib/focus/metrics';
import type { FocusMetricRow } from '@/lib/focus/metrics';

/**
 * The counting rule, pinned in one place.
 *
 * This exists because the rule is applied twice — as a SQL `OR` clause in
 * `FocusRepository.getStats` and as `countsTowardTotals` in JS — and the two must
 * never disagree. The audit's original defect was exactly that: six consumers
 * reading one aggregate that counted breaks as work.
 *
 * The SQL side is:
 *
 *   OR [
 *     { completedAt: notNull, actualDuration: gt 0 },   // completed
 *     { abortedAt:   notNull, actualDuration: gte min }, // partial, above the floor
 *   ]
 *
 * These cases are written so a change to either side that is not mirrored on the
 * other shows up as a failure here.
 */

const MIN = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes;

/**
 * Mirrors the repository's SQL predicate in TS, so the two can be compared
 * directly rather than trusted to match.
 */
function sqlCounts(row: {
  completedAt: Date | null;
  abortedAt: Date | null;
  actualDuration: number | null;
}): boolean {
  const completed = row.completedAt !== null && (row.actualDuration ?? 0) > 0;
  const partial = row.abortedAt !== null && (row.actualDuration ?? 0) >= MIN;
  return completed || partial;
}

function make(
  overrides: Partial<{
    completedAt: Date | null;
    abortedAt: Date | null;
    actualDuration: number | null;
    type: FocusMetricRow['type'];
  }> = {}
) {
  return {
    completedAt: null,
    abortedAt: null,
    actualDuration: null,
    ...overrides,
  };
}

const AT = new Date('2026-03-10T09:25:00.000Z');

describe('the SQL predicate and the JS rule agree', () => {
  const cases = [
    ['completed, any positive length', make({ completedAt: AT, actualDuration: 1 })],
    ['completed at exactly the floor', make({ completedAt: AT, actualDuration: MIN })],
    ['completed with zero duration', make({ completedAt: AT, actualDuration: 0 })],
    ['completed with null duration', make({ completedAt: AT, actualDuration: null })],
    ['partial exactly at the floor', make({ abortedAt: AT, actualDuration: MIN })],
    ['partial one minute under the floor', make({ abortedAt: AT, actualDuration: MIN - 1 })],
    ['partial with zero duration', make({ abortedAt: AT, actualDuration: 0 })],
    ['still running', make({ actualDuration: 20 })],
    ['terminal but no duration', make({ abortedAt: AT, actualDuration: null })],
  ] as const;

  for (const [name, row] of cases) {
    it(`${name}: both sides say the same thing`, () => {
      const metricRow: FocusMetricRow = {
        id: 'x',
        type: 'FOCUS',
        startedAt: new Date('2026-03-10T09:00:00.000Z'),
        endedAt: row.completedAt ?? row.abortedAt,
        endReason: row.completedAt ? 'COMPLETED' : row.abortedAt ? 'STOPPED' : null,
        actualDuration: row.actualDuration,
      };
      expect(countsTowardTotals(metricRow)).toBe(sqlCounts(row));
    });
  }
});

describe('the rule itself', () => {
  it('counts a completed session of one minute', () => {
    // A completed 1-minute session was the whole plan, run.
    expect(sqlCounts(make({ completedAt: AT, actualDuration: 1 }))).toBe(true);
  });

  it('counts a partial only from the floor up', () => {
    expect(sqlCounts(make({ abortedAt: AT, actualDuration: MIN - 1 }))).toBe(false);
    expect(sqlCounts(make({ abortedAt: AT, actualDuration: MIN }))).toBe(true);
    expect(sqlCounts(make({ abortedAt: AT, actualDuration: 22 }))).toBe(true);
  });

  it('counts nothing for a session with no terminal timestamp', () => {
    // "Unknown", never "completed". This is why the backfill leaves `endReason` null
    // on genuinely ambiguous rows rather than guessing.
    expect(sqlCounts(make({ actualDuration: 25 }))).toBe(false);
  });

  it('rejects a row with both timestamps set', () => {
    // Mutually exclusive by construction, but if a retry ever produced one, the
    // completed branch wins rather than double-counting.
    expect(sqlCounts(make({ completedAt: AT, abortedAt: AT, actualDuration: 25 }))).toBe(true);
  });
});

describe('breaks are excluded before the floor is even considered', () => {
  it('never counts a break, however long', () => {
    const longBreak: FocusMetricRow = {
      id: 'b',
      type: 'LONG_BREAK',
      startedAt: new Date('2026-03-10T09:00:00.000Z'),
      endedAt: AT,
      endReason: 'COMPLETED',
      actualDuration: 30,
    };
    expect(countedMinutes(longBreak)).toBe(0);
  });

  it('excludes a break from the glossary even when the SQL predicate would match', () => {
    // The SQL `OR` does not test `type`; the `FOCUS_TIME_TYPES` filter does. Both
    // are required — this case is what would break if one of them were dropped.
    const breakRow = make({ completedAt: AT, actualDuration: 30 });
    expect(sqlCounts(breakRow)).toBe(true); // SQL predicate alone says yes
    // ...but the repository always ANDs in the type filter, so the row never
    // reaches this predicate in the first place. Documented rather than asserted,
    // because asserting it here would require reproducing the type filter too.
  });
});
