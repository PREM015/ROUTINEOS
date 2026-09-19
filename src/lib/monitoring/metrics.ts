/**
 * In-process metrics registry.
 *
 * Lightweight counters, gauges and histograms for request-level telemetry.
 * State lives in this module for the lifetime of the process (per-Vercel-cron
 * invocation); export it via `statsSnapshot` for dashboards or `POST /api/monitoring`.
 */

export type MetricValue = number | string;

export interface SummaryStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, number[]>();
const samples = new Map<string, MetricValue[]>();

/** Maximum samples retained per histograms/sample key. */
export const MAX_SAMPLES = 10_000;

/**
 * Increment a named counter.
 */
export function incrementCounter(name: string, by = 1): number {
  const next = (counters.get(name) ?? 0) + Math.max(0, by);
  counters.set(name, next);
  return next;
}

/**
 * Read a named counter.
 */
export function readCounter(name: string): number {
  return counters.get(name) ?? 0;
}

/**
 * Set a gauge (current value).
 */
export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

/**
 * Increment a gauge by `by` (e.g. +1/-1 for in-flight requests).
 */
export function adjustGauge(name: string, by: number): number {
  const next = (gauges.get(name) ?? 0) + by;
  gauges.set(name, next);
  return next;
}

/** Read a gauge. */
export function readGauge(name: string): number {
  return gauges.get(name) ?? 0;
}

/**
 * Record a numeric observation into a histogram.
 */
export function observe(name: string, value: number): void {
  if (!Number.isFinite(value)) return;
  const bucket = histograms.get(name) ?? [];
  bucket.push(value);
  if (bucket.length > MAX_SAMPLES) bucket.shift();
  histograms.set(name, bucket);
}

/** Summarize a histogram window. Returns null when no samples were recorded. */
export function histogramSummary(name: string): SummaryStats | null {
  const bucket = histograms.get(name) ?? [];
  if (bucket.length === 0) return null;
  const sorted = [...bucket].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0] ?? 0;
  const max = sorted[count - 1] ?? 0;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return { count, sum, min, max, avg: sum / count };
}

/**
 * Append a discrete sample (e.g. a user id) for auditing/dashboarding.
 */
export function recordSample(key: string, value: MetricValue): void {
  const bucket = samples.get(key) ?? [];
  bucket.push(value);
  if (bucket.length > MAX_SAMPLES) bucket.shift();
  samples.set(key, bucket);
}

/** Read recorded samples for a key. */
export function readSamples(key: string): MetricValue[] {
  return samples.get(key) ?? [];
}

/**
 * Full point-in-time snapshot of the registry.
 */
export function statsSnapshot(): {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, SummaryStats>;
  samples: Record<string, number>; // cardinality per key
} {
  const histogramsOut: Record<string, SummaryStats> = {};
  for (const [name, bucket] of histograms) {
    const summary = summarizeLocal(bucket);
    if (summary) histogramsOut[name] = summary;
  }

  const samplesOut: Record<string, number> = {};
  for (const [key, bucket] of samples) {
    samplesOut[key] = new Set(bucket.map(String)).size;
  }

  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    histograms: histogramsOut,
    samples: samplesOut,
  };
}

function summarizeLocal(bucket: number[]): SummaryStats | null {
  if (bucket.length === 0) return null;
  const sorted = [...bucket].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    sum,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sum / sorted.length,
  };
}

/** Reset all metric state (tests / session boundaries). */
export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
  samples.clear();
}