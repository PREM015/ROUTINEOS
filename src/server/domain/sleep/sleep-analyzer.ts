/**
 * Sleep Analyzer – pure domain logic for sleep metrics and patterns.
 * Computes averages, debt, consistency (std-dev), scores, and phase/type
 * detection from raw sleep logs. Uses @/utils/sleep helpers for conversions.
 * No DB access.
 */

import { timeToMinutes } from '@/lib/dates';
import {
  sleepDurationMinutes,
  sleepScoreFromDuration,
} from '@/utils/sleep';

// ============================================================================
// Types
// ============================================================================

/** Minimal raw shape of a sleep log this module works with. */
export interface SleepLogLike {
  /** Logged date (YYYY-MM-DD). */
  date: string;
  /** Bedtime in HH:mm (may be a full datetime string). */
  actualBedtime: string;
  /** Wake time in HH:mm (may be a full datetime string). */
  actualWakeTime: string;
  /** 1-5 quality rating, nullable. */
  quality?: number | null;
  /** Wake-up interruption count, nullable. */
  wakeUpCount?: number | null;
}

export interface SleepAnalysisResult {
  averageDuration: number;
  averageBedtimeMinutes: number;
  averageWakeTimeMinutes: number;
  averageQuality: number | null;
  totalDeficit: number;
  averageDeficit: number;
  consistencyScore: number;
  bestDay: SleepLogLike | null;
  worstDay: SleepLogLike | null;
  score: number;
  phaseType: 'EARLY_BIRD' | 'NIGHT_OWL' | 'VARIABLE';
}

export interface SleepDebtResult {
  nightly: number;
  weekly: number;
  monthly: number;
}

// ============================================================================
// Core metrics
// ============================================================================

/**
 * Minutes of sleep for a single log entry.
 * Accepts both HH:mm and full `YYYY-MM-DD HH:mm` strings.
 * @example
 * sleepMinutes({ date: '2026-09-17', actualBedtime: '23:00', actualWakeTime: '06:30' })
 * // => 450
 */
export function sleepMinutes(log: SleepLogLike): number {
  return sleepDurationMinutes(shortTime(log.actualBedtime), shortTime(log.actualWakeTime));
}

function shortTime(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 5 && trimmed.includes(':')) return trimmed;
  // Full datetime "YYYY-MM-DD HH:mm" – take the HH:mm portion.
  const match = trimmed.match(/(\d{1,2}:\d{2})/);
  return match?.[1] ?? '00:00';
}

/**
 * Average sleep duration in minutes across logs.
 * Returns 0 when there is no data.
 */
export function averageSleepDuration(logs: SleepLogLike[]): number {
  if (logs.length === 0) return 0;
  const total = logs.reduce((sum, log) => sum + sleepMinutes(log), 0);
  return total / logs.length;
}

// ============================================================================
// Debt
// ============================================================================

/**
 * Sleep debt = how much actual duration falls short of the target.
 * @example
 * sleepDebt(380, 450) // => 70
 */
export function sleepDebt(actualMinutes: number, targetMinutes: number): number {
  return Math.max(0, targetMinutes - actualMinutes);
}

/**
 * Aggregate nightly/weekly/monthly debt over a set of logs.
 * @example
 * sleepDebtSummary([logA, logB], 450)
 * // => { nightly: N, weekly: N, monthly: N }
 */
export function sleepDebtSummary(
  logs: SleepLogLike[],
  targetMinutes: number,
): SleepDebtResult {
  const deficits = logs.map((log) => sleepDebt(sleepMinutes(log), targetMinutes));
  const nightly = deficits.length > 0
    ? deficits.reduce((a, b) => a + b, 0) / deficits.length
    : 0;
  const weekly = Math.round(nightly * 7);
  const monthly = Math.round(nightly * 30);
  return { nightly, weekly, monthly };
}

// ============================================================================
// Consistency
// ============================================================================

/**
 * Standard-deviation based consistency of bedtimes / wake times.
 * Lower std-dev = more consistent; score 100 when std-dev <= 15 min.
 * @example
 * sleepConsistency([{ date:'...', actualBedtime:'23:00', actualWakeTime:'06:00' }, ...], 15)
 * // => number 0..100
 */
export function sleepConsistency(
  logs: SleepLogLike[],
  maxVarianceMinutes = 30,
): number {
  if (logs.length < 2) return 0;

  const bedtimes = logs.map((log) => timeToMinutes(shortTime(log.actualBedtime)));
  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance =
    bedtimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / bedtimes.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev <= maxVarianceMinutes) return 100;
  return Math.max(0, Math.min(100, Math.round(100 - (stdDev - maxVarianceMinutes) * 2)));
}

// ============================================================================
// Score
// ============================================================================

/**
 * Overall sleep score 0-100 combining duration, quality, and consistency.
 * @example
 * sleepScore([{ date:'2026-09-17', actualBedtime:'23:00', actualWakeTime:'06:30', quality: 4 }], 450)
 * // => number 0..100
 */
export function sleepScore(logs: SleepLogLike[], targetMinutes: number): number {
  if (logs.length === 0) return 0;

  const durations = logs.map((log) => sleepMinutes(log));
  const durationScore =
    durations.reduce((sum, d) => sum + sleepScoreFromDuration(d, targetMinutes), 0) /
    durations.length;

  const rated = logs.filter((log) => log.quality !== null && log.quality !== undefined);
  const qualityScore =
    rated.length > 0
      ? (rated.reduce((sum, log) => sum + (log.quality ?? 0), 0) / rated.length) * 20
      : 50;

  const consistencyScore = sleepConsistency(logs);

  return Math.max(0, Math.min(100, Math.round(
    durationScore * 0.5 + qualityScore * 0.3 + consistencyScore * 0.2,
  )));
}

// ============================================================================
// Best / worst day
// ============================================================================

/**
 * The log with the longest sleep duration (ties broken by quality).
 * Null when there are no logs.
 */
export function findBestDay(logs: SleepLogLike[]): SleepLogLike | null {
  if (logs.length === 0) return null;
  let best = logs[0] ?? null;
  for (const log of logs) {
    if (!best) { best = log; continue; }
    const cmp = sleepMinutes(log) - sleepMinutes(best);
    if (cmp > 0 || (cmp === 0 && (log.quality ?? 0) > (best.quality ?? 0))) {
      best = log;
    }
  }
  return best;
}

/**
 * The log with the shortest sleep duration. Null when there are no logs.
 */
export function findWorstDay(logs: SleepLogLike[]): SleepLogLike | null {
  if (logs.length === 0) return null;
  let worst = logs[0] ?? null;
  for (const log of logs) {
    if (!worst) { worst = log; continue; }
    const cmp = sleepMinutes(log) - sleepMinutes(worst);
    if (cmp < 0 || (cmp === 0 && (log.quality ?? 0) < (worst.quality ?? 0))) {
      worst = log;
    }
  }
  return worst;
}

// ============================================================================
// Phase detection
// ============================================================================

/**
 * Classify a user's chronotype from average bedtime.
 * @example
 * detectSleepPhase([{ date:'...', actualBedtime:'22:30', actualWakeTime:'06:00' }])
 * // => 'EARLY_BIRD'
 */
export function detectSleepPhase(logs: SleepLogLike[]): 'EARLY_BIRD' | 'NIGHT_OWL' | 'VARIABLE' {
  if (logs.length === 0) return 'VARIABLE';

  const bedtimes = logs.map((log) => timeToMinutes(shortTime(log.actualBedtime)));
  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;

  // Pre-midnight sleepers are early birds; post-1 AM are night owls.
  if (mean < 22 * 60) return 'EARLY_BIRD';
  if (mean > 2 * 60 + 30) return 'NIGHT_OWL';
  return 'VARIABLE';
}

// ============================================================================
// Aggregate analysis
// ============================================================================

/**
 * Full sleep analysis of a set of logs.
 * @example
 * analyzeSleep([logA, logB], 450)
 * // => { averageDuration, averageBedtimeMinutes, ..., score, phaseType }
 */
export function analyzeSleep(
  logs: SleepLogLike[],
  targetMinutes: number,
): SleepAnalysisResult {
  const averageDuration = averageSleepDuration(logs);
  const bedtimes = logs.map((log) => timeToMinutes(shortTime(log.actualBedtime)));
  const wakeTimes = logs.map((log) => timeToMinutes(shortTime(log.actualWakeTime)));
  const mean = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const rated = logs.filter((log) => log.quality !== null && log.quality !== undefined);
  const averageQuality =
    rated.length > 0
      ? rated.reduce((sum, log) => sum + (log.quality ?? 0), 0) / rated.length
      : null;

  const debt = sleepDebtSummary(logs, targetMinutes);

  return {
    averageDuration,
    averageBedtimeMinutes: mean(bedtimes),
    averageWakeTimeMinutes: mean(wakeTimes),
    averageQuality,
    totalDeficit: logs.reduce(
      (sum, log) => sum + sleepDebt(sleepMinutes(log), targetMinutes),
      0,
    ),
    averageDeficit: debt.nightly,
    consistencyScore: sleepConsistency(logs),
    bestDay: findBestDay(logs),
    worstDay: findWorstDay(logs),
    score: sleepScore(logs, targetMinutes),
    phaseType: detectSleepPhase(logs),
  };
}