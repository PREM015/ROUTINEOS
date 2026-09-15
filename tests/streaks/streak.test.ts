import { describe, it, expect } from 'vitest';
import { calculateStreak, checkNewMilestone } from '../../src/lib/streaks/streak';

describe('calculateStreak', () => {
  it('Consecutive qualifying days = streak count', () => {
    expect(calculateStreak([{ qualifying: true }, { qualifying: true }])).toBe(2);
  });
  it('Rest day preserved streak', () => {
    expect(calculateStreak([{ qualifying: true }, { isRestDay: true }, { qualifying: true }])).toBe(3);
  });
  it('Minimum day with all NNs = preserved', () => {
    expect(calculateStreak([{ qualifying: true }, { isMinimumDay: true, nnCompleted: true }, { qualifying: true }])).toBe(3);
  });
  it('Missing day breaks streak', () => {
    expect(calculateStreak([{ qualifying: true }, { qualifying: false }, { qualifying: true }])).toBe(1);
  });
  it('checkNewMilestone returns correct milestones', () => {
    expect(checkNewMilestone(7)).toEqual(7);
    expect(checkNewMilestone(30)).toEqual(30);
  });
});
