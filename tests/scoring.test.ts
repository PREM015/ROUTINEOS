import { describe, it, expect } from 'vitest';
import { calculateCoreScore } from '../src/config/scoring';

describe('calculateCoreScore', () => {
  it('All habits completed = 100', () => {
    expect(calculateCoreScore({ total: 5, completed: 5, nonNegotiables: { total: 2, completed: 2 } })).toBe(100);
  });
  it('No habits scheduled = 100', () => {
    expect(calculateCoreScore({ total: 0, completed: 0, nonNegotiables: { total: 0, completed: 0 } })).toBe(100);
  });
  it('Only NNs, all done = high score', () => {
    expect(calculateCoreScore({ total: 2, completed: 2, nonNegotiables: { total: 2, completed: 2 } })).toBe(100);
  });
  it('Rest day = 100', () => {
    expect(calculateCoreScore({ total: 0, completed: 0, nonNegotiables: { total: 0, completed: 0 }, isRestDay: true })).toBe(100);
  });
  it('Missed day = 0', () => {
    expect(calculateCoreScore({ total: 5, completed: 0, nonNegotiables: { total: 2, completed: 0 } })).toBe(0);
  });
  it('Minimum day = only NNs count', () => {
    expect(calculateCoreScore({ total: 5, completed: 2, nonNegotiables: { total: 2, completed: 2 }, isMinimumDay: true })).toBe(100);
  });
  it('Partial completion math', () => {
    const score = calculateCoreScore({ total: 10, completed: 5, nonNegotiables: { total: 2, completed: 1 } });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});
