import { describe, it, expect } from 'vitest';
import { calculateSleepDuration, isOvernightSleep, getSleepDebt, isSleepHealthy } from '../../src/lib/sleep/sleep';

describe('Sleep logic', () => {
  it('calculateSleepDuration overnight', () => {
    expect(calculateSleepDuration(new Date('2023-10-01T22:00:00Z'), new Date('2023-10-02T06:00:00Z'))).toBe(8);
  });
  it('calculateSleepDuration same day', () => {
    expect(calculateSleepDuration(new Date('2023-10-01T01:00:00Z'), new Date('2023-10-01T09:00:00Z'))).toBe(8);
  });
  it('isOvernightSleep detection', () => {
    expect(isOvernightSleep(new Date('2023-10-01T22:00:00Z'), new Date('2023-10-02T06:00:00Z'))).toBe(true);
  });
  it('getSleepDebt positive/negative', () => {
    expect(getSleepDebt(6, 8)).toBe(2);
    expect(getSleepDebt(9, 8)).toBe(-1);
  });
  it('isSleepHealthy thresholds', () => {
    expect(isSleepHealthy(8)).toBe(true);
    expect(isSleepHealthy(4)).toBe(false);
  });
});
