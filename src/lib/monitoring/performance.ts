/**
 * Performance instrumentation (server + client safe).
 *
 * Thin wrappers over `performance.mark`/`measure` plus a real stopwatch for
 * timing async operations. Works in the browser and under Node 16+ (Node
 * exposes `performance` from the `perf_hooks` global).
 */

import { observe } from './metrics';

/** Mark a named point in the timeline (no-op when performance is absent). */
export function mark(name: string): void {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
    performance.mark(name);
  }
}

/**
 * Record a `performance.measure`. Gracefully ignores missing marks (the spec
 * throws when start/end marks do not exist).
 */
export function measure(
  name: string,
  startMark: string,
  endMark: string
): number | null {
  if (
    typeof performance === 'undefined' ||
    typeof performance.measure !== 'function'
  ) {
    return null;
  }
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name);
    const entry = entries[entries.length - 1];
    return entry?.duration ?? null;
  } catch {
    return null;
  }
}

/**
 * Time the execution of a function. If `label` is given, the elapsed ms is
 * also reported through `performance.measure`.
 *
 * @example
 * const { result, elapsedMs } = await timed(() => repository.find(), 'habit.find');
 */
export async function timed<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; elapsedMs: number }> {
  const startMark = label ? `${label}:start` : undefined;
  if (startMark) mark(startMark);

  const started = now();
  const result = await fn();
  const elapsedMs = now() - started;

  if (label) measure(label, startMark as string, `${label}:end`);
  return { result, elapsedMs };
}

/**
 * Simple stopwatch class for manual timing with MICROsecond resolution.
 */
export class Stopwatch {
  private startedAt = nowFull();

  /** Elapsed time in milliseconds. */
  elapsedMs(): number {
    return nowFull() - this.startedAt;
  }

  /** Reset the stopwatch. */
  reset(): this {
    this.startedAt = nowFull();
    return this;
  }
}

function now(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function nowFull(): number {
  return typeof performance !== 'undefined' && performance.timeOrigin
    ? performance.timeOrigin + performance.now()
    : Date.now();
}

/**
 * Wrap a callback so its duration is pushed into the metrics registry.
 */
export async function timedWithMetric<T>(
  metricName: string,
  fn: () => Promise<T>
): Promise<T> {
  const started = nowFull();
  try {
    return await fn();
  } finally {
    observe(metricName, nowFull() - started);
  }
}