import { describe, expect, it } from 'vitest';
import { chartValue, deltaText, orNull, percentText, widthPercent } from '@/lib/analytics/format';

/**
 * The difference between "we measured zero" and "we have no measurement".
 *
 * `AnalyticsChartData.value`, `tiles.habitCompletion`, `habits.rate` and the
 * per-tier rates are all `number | null`, and every surface that renders them
 * used to coerce `null` into `0`. That is what drew a full year of zero-height
 * bars for months a user had not reached, and what rendered `NaN%` on a recap
 * week where nothing was due.
 */

describe('percentText', () => {
  it('renders a measured value', () => {
    expect(percentText(71.428)).toBe('71%');
    expect(percentText(0)).toBe('0%');
    expect(percentText(100)).toBe('100%');
  });

  it('renders an absent value as a dash, never as 0%', () => {
    expect(percentText(null)).toBe('—');
    expect(percentText(undefined)).toBe('—');
    expect(percentText(Number.NaN)).toBe('—');
  });

  it('honours the decimals argument', () => {
    expect(percentText(71.428, 1)).toBe('71.4%');
  });
});

describe('orNull', () => {
  it('passes a real number through and rejects everything absent', () => {
    expect(orNull(0)).toBe(0);
    expect(orNull(42)).toBe(42);
    expect(orNull(null)).toBeNull();
    expect(orNull(Number.NaN)).toBeNull();
  });
});

describe('chartValue', () => {
  it('keeps absence as absence so a chart can draw a gap', () => {
    expect(chartValue(0)).toBe(0);
    expect(chartValue(null)).toBeNull();
  });
});

describe('widthPercent', () => {
  it('clamps a bar width to 0-100', () => {
    expect(widthPercent(0)).toBe('0%');
    expect(widthPercent(50)).toBe('50%');
    expect(widthPercent(140)).toBe('100%');
    expect(widthPercent(-20)).toBe('0%');
  });

  it('returns null when there is nothing to draw', () => {
    expect(widthPercent(null)).toBeNull();
  });
});

describe('deltaText', () => {
  it('signs a positive delta', () => {
    expect(deltaText(4)).toBe('+4');
    expect(deltaText(4.26)).toBe('+4.3');
  });

  it('signs a negative delta', () => {
    expect(deltaText(-2.5)).toBe('-2.5');
  });

  it('names a zero delta rather than showing a signed zero', () => {
    expect(deltaText(0)).toBe('no change');
    expect(deltaText(0.04)).toBe('no change');
  });

  it('returns null when the comparison does not exist', () => {
    /*
      `null` is what a part-lived month or a period with no prior scores sends.
      It must render as "nothing to compare", not as "you improved by 0".
    */
    expect(deltaText(null)).toBeNull();
  });
});
