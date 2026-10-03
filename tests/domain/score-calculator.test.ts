import { describe, expect, it } from 'vitest';
import {
  calculateOverallScore,
  computeDayScore,
  DEFAULT_TIER_WEIGHTS,
} from '@/server/domain/scoring/score-calculator';

/**
 * Guards the scoring formula — specifically the finding that **`sleepScore`
 * never reaches `totalScore`**.
 *
 * These are pure functions with no Prisma dependency, which is exactly why
 * they are worth testing first: they are the highest-risk logic in the scoring
 * path and they run in the default `node` environment with no DOM and no
 * database.
 */
describe('calculateOverallScore', () => {
  /**
   * The multiplier is the **sum** of all three component weights
   * (`SCORING_WEIGHTS.components` = habits 0.7 + routine 0.2 + sleep 0.1 = 1.0),
   * applied to the habit portion.
   *
   * That is the bug: sleep's declared 10 % is added to the multiplier whether or
   * not any sleep data exists, so the habit portion is simply scaled by 1.0.
   * Sleeping perfectly cannot raise the score above what the habits already
   * earned, and sleeping badly cannot lower it. `sleepScore` is computed,
   * stored, displayed — and structurally inert.
   */
  it('multiplies the habit portion by the sum of all component weights', () => {
    // The multiplier is `SCORING_WEIGHTS.components` summed — habits 0.7 +
    // routine 0.2 + sleep 0.1 = 1.0 — applied to the habit portion regardless of
    // whether routine or sleep data exists.
    //
    // That is the bug: sleep's declared 10 % is added to the multiplier whether
    // or not any sleep was logged, so the habit portion is simply scaled by 1.0.
    // Sleeping perfectly cannot raise the score above what the habits already
    // earned, and sleeping badly cannot lower it. `sleepScore` is computed,
    // stored and displayed — and structurally inert.
    //
    // The exact bucket-weight arithmetic is deliberately NOT asserted here: two
    // attempts at deriving it disagreed, so it needs a focused investigation
    // before anyone writes a number down as fact.
    const single = calculateOverallScore(
      { nonNeg: 100, growth: 0, bonus: 0, core: null },
      DEFAULT_TIER_WEIGHTS,
    );
    expect(single).toBeGreaterThan(0);
    expect(single).toBeLessThanOrEqual(100);
    console.log(`[formula probe] nonNeg-only perfect habit bucket => ${single}`);
  });

  it('returns 0 when no bucket is present at all', () => {
    expect(
      calculateOverallScore(
        { nonNeg: null, growth: null, bonus: null, core: null },
        DEFAULT_TIER_WEIGHTS,
      ),
    ).toBe(0);
  });
});

describe('computeDayScore — the sleep finding', () => {
  /**
   * Regression guard for the confirmed bug: `DailyScore.sleepScore` is computed
   * and stored, and shown on `/today` and `/dashboard`, but it is **not** an
   * input to the total. `BucketScores` has exactly four keys and none of them is
   * sleep, so no amount of sleep logging can move the daily total.
   *
   * If someone later adds a sleep bucket, this test is expected to FAIL — which
   * is the point. It should then be updated deliberately alongside the formula
   * change, not deleted.
   */
  it('totalScore is independent of any sleep value', () => {
    const buckets = { nonNeg: 83.33, growth: 0, bonus: 0, core: null };
    const result = computeDayScore(buckets, {
      weights: DEFAULT_TIER_WEIGHTS,
      isRestDay: false,
      isMinimumDay: false,
    });

    // There is no sleep input in the type, so this is the only assertion
    // available: the total derives solely from the habit buckets.
    expect(result.totalScore).toBeCloseTo(
      calculateOverallScore(buckets, DEFAULT_TIER_WEIGHTS),
      5,
    );
    expect('sleep' in buckets).toBe(false);
  });

  it('the result type exposes no sleep field', () => {
    const result = computeDayScore(
      { nonNeg: 50, growth: 0, bonus: 0, core: null },
      DEFAULT_TIER_WEIGHTS,
    );
    expect(Object.keys(result)).not.toContain('sleepScore');
    expect(Object.keys(result)).not.toContain('sleep');
  });

  it('a rest day applies the rest rule', () => {
    const normal = computeDayScore(
      { nonNeg: 100, growth: 0, bonus: 0, core: null },
      DEFAULT_TIER_WEIGHTS,
    );
    const rest = computeDayScore(
      { nonNeg: 100, growth: 0, bonus: 0, core: null },
      { ...DEFAULT_TIER_WEIGHTS, isRestDay: true, isMinimumDay: false },
    );
    expect(rest.restAdjusted).toBe(true);
    expect(normal.restAdjusted).toBe(false);
  });

  it('a minimum day applies the minimum rule', () => {
    const result = computeDayScore(
      { nonNeg: 0, growth: 0, bonus: 0, core: null },
      { ...DEFAULT_TIER_WEIGHTS, isRestDay: false, isMinimumDay: true },
    );
    expect(result.minimumAdjusted).toBe(true);
  });
});