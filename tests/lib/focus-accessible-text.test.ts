import { describe, expect, it } from 'vitest';
import { describeProgress } from '@/components/focus/TimerDial';
import { formatFocusMinutes, summariseFocusWeek, type FocusWeekDay } from '@/components/focus/FocusWeekStrip';
import { FOCUS_METRIC_DEFAULTS } from '@/lib/focus/metrics';

/**
 * The accessible text alternatives.
 *
 * These exist because a bar's height and an arc's sweep are the only carriers of the
 * value they show. If the wording regresses - or the rounding makes the string churn
 * on every tick - nobody notices by looking at the page, because the page still looks
 * correct. That is the failure mode these tests exist to catch.
 */

describe('describeProgress', () => {
  it('is absent for a stopwatch, which has no planned length', () => {
    expect(describeProgress(0.5, true)).toBeNull();
    expect(describeProgress(0, true)).toBeNull();
    expect(describeProgress(1, true)).toBeNull();
  });

  it('rounds to the nearest ten so the string is stable while the arc creeps', () => {
    // 0.73 and 0.74 both speak as "70", so the live string does not change every tick.
    expect(describeProgress(0.73, false)).toBe('About 70 percent of the timebox elapsed');
    expect(describeProgress(0.74, false)).toBe('About 70 percent of the timebox elapsed');
    expect(describeProgress(0.76, false)).toBe('About 80 percent of the timebox elapsed');
  });

  it('names the ends rather than saying "0 percent" or "100 percent"', () => {
    expect(describeProgress(0, false)).toBe('Just started');
    expect(describeProgress(0.004, false)).toBe('Just started');
    expect(describeProgress(1, false)).toBe('Timebox complete');
    expect(describeProgress(0.996, false)).toBe('Timebox complete');
  });

  it('is null for a non-finite fraction rather than saying "NaN percent"', () => {
    expect(describeProgress(Number.NaN, false)).toBeNull();
    expect(describeProgress(Number.POSITIVE_INFINITY, false)).toBeNull();
  });
});

describe('formatFocusMinutes', () => {
  it('renders a bare zero as "0m"', () => {
    // "0h 00m" is noise on a bar chart whose whole point is that a zero is visible.
    expect(formatFocusMinutes(0)).toBe('0m');
    expect(formatFocusMinutes(-5)).toBe('0m');
  });

  it('drops the minute part on a whole hour', () => {
    expect(formatFocusMinutes(60)).toBe('1h');
    expect(formatFocusMinutes(125)).toBe('2h 05m');
    expect(formatFocusMinutes(45)).toBe('45m');
  });
});

describe('summariseFocusWeek', () => {
  const day = (date: string, focusMinutes: number): FocusWeekDay => ({
    date,
    focusMinutes,
    completedSessions: 1,
    partialSessions: 0,
  });

  const threshold = FOCUS_METRIC_DEFAULTS.streakDayMinutes;

  it('is empty for no days rather than reading as a broken week', () => {
    expect(summariseFocusWeek([], threshold)).toBe('');
  });

  it('counts met days against the threshold, not against a majority', () => {
    const summary = summariseFocusWeek(
      [
        day('2026-10-01', threshold),
        day('2026-10-02', threshold - 1),
        day('2026-10-03', 0),
      ],
      threshold
    );
    expect(summary).toBe('3 days, 49m total, 1 of 3 met the 25-minute target');
  });

  it('includes a day with no focus as short, not absent', () => {
    // The bar strip is dense on purpose; a zero day is a real day off, and saying
    // "2 of 3" when three days are shown would be a lie.
    const summary = summariseFocusWeek([day('2026-10-01', 0), day('2026-10-02', 60)], threshold);
    expect(summary).toContain('2 days');
    expect(summary).toContain('1 of 2 met');
  });
});