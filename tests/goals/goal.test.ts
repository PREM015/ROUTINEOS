import { describe, it, expect } from 'vitest';
import { calculateCompletionPercentage, isGoalExpired, isGoalAtRisk, canCarryOver, calculateVelocity } from '../../src/lib/goals/goal';

describe('Goals logic', () => {
  it('calculateCompletionPercentage', () => {
    expect(calculateCompletionPercentage(5, 10)).toBe(50);
  });
  it('isGoalExpired', () => {
    expect(isGoalExpired(new Date('2020-01-01'), new Date())).toBe(true);
  });
  it('isGoalAtRisk', () => {
    expect(isGoalAtRisk(5, 10, new Date('2020-01-01'), new Date())).toBe(true);
  });
  it('canCarryOver', () => {
    expect(canCarryOver({ status: 'IN_PROGRESS' })).toBe(true);
  });
  it('calculateVelocity', () => {
    expect(calculateVelocity(10, 5)).toBe(2);
  });
});
