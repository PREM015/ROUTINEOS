import { describe, expect, it } from 'vitest';
import { calculateDayScore, calculateWeeklyScore } from '../src/lib/scoring';

describe('scoring safeguards', () => {
  it('returns null when no non-negotiables are scheduled', () => {
    const result = calculateDayScore([
      { id: 'g1', tier: 'GROWTH', completed: true, scheduled: true },
      { id: 'b1', tier: 'BONUS', completed: false, scheduled: true },
    ]);

    expect(result.coreScore).toBeNull();
    expect(result.nnTotal).toBe(0);
  });

  it('ignores null core scores when calculating weekly averages', () => {
    expect(calculateWeeklyScore([90, null, 75, null, 80])).toBe(81.7);
  });
});
