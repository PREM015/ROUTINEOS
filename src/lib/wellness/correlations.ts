/**
 * Correlations – pure logic for Pearson correlations between wellness signals
 * (mood, energy, sleep duration) and per-day activity/scores. No DB access.
 */

// ============================================================================
// Types
// ============================================================================

/** Pair of aligned numeric samples. */
export interface CorrelatedPair {
  /** Independent variable (e.g. sleep minutes). */
  x: number;
  /** Dependent variable (e.g. mood). */
  y: number;
}

export type CorrelationStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

export interface CorrelationResult {
  /** Pearson r in [-1, 1]. */
  coefficient: number;
  strength: CorrelationStrength;
  /** Whether the correlation is negative (inverse relationship). */
  inverse: boolean;
  /** Number of valid pairs used. */
  sampleCount: number;
}

/** Per-day numeric factor keyed by YYYY-MM-DD. */
export type FactorByDate = Record<string, number>;

// ============================================================================
// Core math
// ============================================================================

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Pearson correlation coefficient between two aligned numeric series.
 * Returns 0 when there is not enough data or either series is constant.
 * @example
 * pearsonCorrelation([1, 2, 3], [2, 4, 6]) // => 1
 * pearsonCorrelation([1, 2, 3], [6, 4, 2]) // => -1
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;

  return round(numerator / denom, 3);
}

/**
 * Classify the absolute correlation value into a strength bucket.
 * @example
 * correlationStrength(0.9) // => 'STRONG'
 * correlationStrength(-0.1) // => 'NONE'
 */
export function correlationStrength(coefficient: number): CorrelationStrength {
  const magnitude = Math.abs(coefficient);
  if (magnitude >= 0.7) return 'STRONG';
  if (magnitude >= 0.4) return 'MODERATE';
  if (magnitude >= 0.2) return 'WEAK';
  return 'NONE';
}

/**
 * Full correlation result for an aligned series. Pairs with NaN/Infinity are
 * dropped before computing.
 */
export function correlate(xs: number[], ys: number[]): CorrelationResult {
  const pairs: CorrelatedPair[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (x === undefined || y === undefined) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pairs.push({ x, y });
  }

  const coefficient = pearsonCorrelation(
    pairs.map(pair => pair.x),
    pairs.map(pair => pair.y)
  );

  return {
    coefficient,
    strength: correlationStrength(coefficient),
    inverse: coefficient < -0.2,
    sampleCount: pairs.length,
  };
}

// ============================================================================
// Wellness-specific helpers
// ============================================================================

/**
 * Correlate mood values against a per-day factor (e.g. daily score, focus
 * minutes). Days without either value are skipped.
 * @example
 * correlateWithDailyFactor(
 *   [{ date: '2026-09-17', mood: 4 }, { date: '2026-09-18', mood: 5 }],
 *   { '2026-09-17': 82, '2026-09-18': 95 }
 * )
 * // => { coefficient: 1, strength: 'STRONG', inverse: false, sampleCount: 2 }
 */
export function correlateWithDailyFactor(
  logs: Array<{ date: string; mood: number }>,
  factorByDate: FactorByDate
): CorrelationResult {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const log of logs) {
    const factor = factorByDate[log.date];
    if (factor !== undefined && Number.isFinite(factor)) {
      xs.push(factor);
      ys.push(log.mood);
    }
  }
  return correlate(xs, ys);
}

/**
 * Correlate mood against sleep duration keyed by date.
 * @example
 * correlateMoodWithSleep([{ date: '2026-09-17', mood: 4 }], { '2026-09-17': 450 })
 * // => CorrelationResult
 */
export function correlateMoodWithSleep(
  logs: Array<{ date: string; mood: number }>,
  sleepMinutesByDate: FactorByDate
): CorrelationResult {
  return correlateWithDailyFactor(logs, sleepMinutesByDate);
}