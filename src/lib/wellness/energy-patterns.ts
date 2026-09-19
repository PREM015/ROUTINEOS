/**
 * Energy patterns – pure logic for discovering time-of-day energy peaks and
 * troughs from time-stamped energy values. No DB access.
 */

// ============================================================================
// Types
// ============================================================================

/** A single time-stamped energy sample (energy on a 1-5 scale). */
export interface EnergyPoint {
  /** Date (YYYY-MM-DD) of the sample. */
  date: string;
  /** Time of day in HH:mm. */
  time: string;
  /** 1-5 energy rating. */
  energy: number;
}

export interface HourBand {
  hour: number;
  count: number;
  averageEnergy: number;
}

export interface EnergyPatternResult {
  averageEnergy: number;
  sampleCount: number;
  peakHour: number | null;
  troughHour: number | null;
  peakEnergy: number;
  troughEnergy: number;
  byHour: HourBand[];
  /** Recommended hours to schedule high-energy work. */
  recommendedHighEnergyHours: number[];
  /** Hours when energy tends to dip. */
  lowEnergyHours: number[];
}

// ============================================================================
// Helpers
// ============================================================================

const MIN_SAMPLES_PER_HOUR = 2;

function hourOf(time: string): number {
  const match = time.match(/(\d{1,2}):/);
  const raw = match?.[1] ?? '0';
  return Math.min(23, Math.max(0, parseInt(raw, 10)));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// ============================================================================
// Bucketing
// ============================================================================

/**
 * Group energy samples by hour of day, with per-hour averages.
 * @example
 * energyByHour([
 *   { date: '2026-09-17', time: '09:00', energy: 5 },
 *   { date: '2026-09-18', time: '09:30', energy: 4 },
 * ])
 * // => [{ hour: 9, count: 2, averageEnergy: 4.5 }, ...]
 */
export function energyByHour(points: EnergyPoint[]): HourBand[] {
  const buckets = new Map<number, number[]>();
  for (const point of points) {
    const hour = hourOf(point.time);
    const list = buckets.get(hour) ?? [];
    list.push(point.energy);
    buckets.set(hour, list);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, values]) => ({
      hour,
      count: values.length,
      averageEnergy: Math.round(mean(values) * 10) / 10,
    }));
}

// ============================================================================
// Pattern detection
// ============================================================================

/**
 * Detect the hour with the highest average energy. `null` when there is
 * insufficient data (fewer than {@link MIN_SAMPLES_PER_HOUR} samples).
 */
export function findPeakHour(bands: HourBand[]): { hour: number; averageEnergy: number } | null {
  const candidates = bands.filter(band => band.count >= MIN_SAMPLES_PER_HOUR);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, band) =>
    band.averageEnergy > best.averageEnergy ? band : best
  );
}

/**
 * Detect the hour with the lowest average energy. `null` when there is
 * insufficient data.
 */
export function findTroughHour(bands: HourBand[]): { hour: number; averageEnergy: number } | null {
  const candidates = bands.filter(band => band.count >= MIN_SAMPLES_PER_HOUR);
  if (candidates.length === 0) return null;

  return candidates.reduce((worst, band) =>
    band.averageEnergy < worst.averageEnergy ? band : worst
  );
}

// ============================================================================
// Aggregate analysis
// ============================================================================

/**
 * Full energy-pattern analysis of a set of time-stamped samples.
 * @example
 * analyzeEnergyPatterns([
 *   { date: '2026-09-17', time: '09:00', energy: 5 },
 *   { date: '2026-09-17', time: '14:00', energy: 2 },
 * ])
 * // => { averageEnergy: 3.5, peakHour: 9, ..., recommendedHighEnergyHours: [9], ... }
 */
export function analyzeEnergyPatterns(points: EnergyPoint[]): EnergyPatternResult {
  const byHour = energyByHour(points);
  const peak = findPeakHour(byHour);
  const trough = findTroughHour(byHour);

  const totalSamples = points.length;
  const averageEnergy = totalSamples > 0
    ? Math.round(mean(points.map(point => point.energy)) * 10) / 10
    : 0;

  const recommendedHighEnergyHours = byHour
    .filter(band => band.count >= MIN_SAMPLES_PER_HOUR && band.averageEnergy >= 4)
    .map(band => band.hour);

  const lowEnergyHours = byHour
    .filter(band => band.count >= MIN_SAMPLES_PER_HOUR && band.averageEnergy <= 2)
    .map(band => band.hour);

  return {
    averageEnergy,
    sampleCount: totalSamples,
    peakHour: peak?.hour ?? null,
    troughHour: trough?.hour ?? null,
    peakEnergy: peak?.averageEnergy ?? 0,
    troughEnergy: trough?.averageEnergy ?? 0,
    byHour,
    recommendedHighEnergyHours,
    lowEnergyHours,
  };
}