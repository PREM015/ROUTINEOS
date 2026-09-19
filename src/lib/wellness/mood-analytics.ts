/**
 * Mood analytics – pure logic for mood/energy check-ins.
 * Computes averages, distributions, and trends from 1-5 mood/energy values.
 * No DB access.
 */

// ============================================================================
// Types
// ============================================================================

/** Minimal raw shape of a mood check-in this module works with. */
export interface MoodLogLike {
  /** Check-in date (YYYY-MM-DD). */
  date: string;
  /** 1-5 mood rating. */
  mood: number;
  /** 1-5 energy rating, nullable. */
  energy?: number | null;
  /** Optional full timestamp (ISO or "YYYY-MM-DD HH:mm"). */
  timestamp?: string | null;
}

export interface MoodDistribution {
  value: number;
  count: number;
  percentage: number;
}

export interface MoodTrend {
  slope: number;
  direction: 'IMPROVING' | 'DECLINING' | 'FLAT';
  change: number;
}

export interface MoodAnalysisResult {
  averageMood: number;
  averageEnergy: number | null;
  count: number;
  daysTracked: number;
  moodTrend: MoodTrend;
  bestDay: MoodLogLike | null;
  worstDay: MoodLogLike | null;
  distribution: MoodDistribution[];
}

// ============================================================================
// Averages
// ============================================================================

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Average mood across check-ins. Returns 0 when empty.
 * @example
 * averageMood([{ date: '2026-09-17', mood: 4 }, { date: '2026-09-18', mood: 3 }])
 * // => 3.5
 */
export function averageMood(logs: MoodLogLike[]): number {
  return logs.length > 0 ? mean(logs.map(log => log.mood)) : 0;
}

/**
 * Average energy across check-ins that have an energy value. Returns `null`
 * when there is no energy data at all.
 * @example
 * averageEnergy([{ date: '2026-09-17', mood: 4, energy: 4 }])
 * // => 4
 */
export function averageEnergy(logs: MoodLogLike[]): number | null {
  const rated = logs.filter(log => log.energy !== null && log.energy !== undefined);
  return rated.length > 0 ? mean(rated.map(log => log.energy as number)) : null;
}

// ============================================================================
// Distribution
// ============================================================================

/**
 * How often each mood value (1-5) was recorded, with percentages.
 * @example
 * moodDistribution([{ date:'...', mood: 4 }, { date:'...', mood: 4 }])
 * // => [{ value: 1, count: 0, percentage: 0 }, ..., { value: 4, count: 2, percentage: 100 }, ...]
 */
export function moodDistribution(logs: MoodLogLike[]): MoodDistribution[] {
  const counts: Record<number, number> = {};
  for (const log of logs) {
    const value = Math.min(5, Math.max(1, Math.round(log.mood)));
    counts[value] = (counts[value] ?? 0) + 1;
  }

  const total = logs.length;
  return Array.from({ length: 5 }, (_, index) => {
    const value = index + 1;
    const count = counts[value] ?? 0;
    return {
      value,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

// ============================================================================
// Trend
// ============================================================================

/**
 * Ordinary-least-squares trend over check-ins ordered by date.
 * Direction is derived from the total change across the window.
 * @example
 * moodTrend([{ date: '2026-09-15', mood: 2 }, { date: '2026-09-16', mood: 3 }, { date: '2026-09-17', mood: 4 }])
 * // => { slope: 1, direction: 'IMPROVING', change: 2 }
 */
export function moodTrend(logs: MoodLogLike[]): MoodTrend {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  if (n < 2) return { slope: 0, direction: 'FLAT', change: 0 };

  const values = sorted.map(log => log.mood);
  const sumX = ((n - 1) * n) / 2;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((acc, value, index) => acc + index * value, 0);
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denominator = sumX2 - n * meanX * meanX;
  const slope = denominator === 0 ? 0 : (sumXY - n * meanX * meanY) / denominator;
  const change = slope * (n - 1);

  const direction: MoodTrend['direction'] =
    change > 0.1 * Math.abs(meanY || 1)
      ? 'IMPROVING'
      : change < -0.1 * Math.abs(meanY || 1)
        ? 'DECLINING'
        : 'FLAT';

  return { slope, direction, change: round(change) };
}

// ============================================================================
// Best / worst day
// ============================================================================

/**
 * Check-in with the highest mood (ties broken by energy). `null` when empty.
 */
export function findBestMoodDay(logs: MoodLogLike[]): MoodLogLike | null {
  if (logs.length === 0) return null;
  let best = logs[0] ?? null;
  for (const log of logs) {
    if (!best) { best = log; continue; }
    const a = log.mood + ((log.energy ?? 0) * 0.1);
    const b = best.mood + ((best.energy ?? 0) * 0.1);
    if (a > b) best = log;
  }
  return best;
}

/**
 * Check-in with the lowest mood (ties broken by energy). `null` when empty.
 */
export function findWorstMoodDay(logs: MoodLogLike[]): MoodLogLike | null {
  if (logs.length === 0) return null;
  let worst = logs[0] ?? null;
  for (const log of logs) {
    if (!worst) { worst = log; continue; }
    const a = log.mood + ((log.energy ?? 0) * 0.1);
    const b = worst.mood + ((worst.energy ?? 0) * 0.1);
    if (a < b) worst = log;
  }
  return worst;
}

// ============================================================================
// Aggregate analysis
// ============================================================================

/**
 * Full mood analysis of a set of check-ins.
 * @example
 * analyzeMood([{ date: '2026-09-17', mood: 4, energy: 3 }])
 * // => { averageMood: 4, averageEnergy: 3, count: 1, ..., distribution: [...] }
 */
export function analyzeMood(logs: MoodLogLike[]): MoodAnalysisResult {
  const uniqueDates = new Set(logs.map(log => log.date));
  return {
    averageMood: round(averageMood(logs)),
    averageEnergy: (() => {
      const avg = averageEnergy(logs);
      return avg === null ? null : round(avg);
    })(),
    count: logs.length,
    daysTracked: uniqueDates.size,
    moodTrend: moodTrend(logs),
    bestDay: findBestMoodDay(logs),
    worstDay: findWorstMoodDay(logs),
    distribution: moodDistribution(logs),
  };
}