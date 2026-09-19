import {
  isValidFocusTimerState,
  type FocusTimerSnapshot,
} from '@/types/focus';

/**
 * Focus session lifecycle helpers.
 * Pure functions that build, advance, interrupt, and restore a running focus
 * session timer without touching persistence.
 */

export interface SessionCompletion {
  /** Effective duration in seconds captured by the session. */
  durationSeconds: number;
  /** True when the timer ran past its planned end and was cut off. */
  truncated: boolean;
}

const VALID_STATES: readonly FocusTimerState[] = [
  'IDLE',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
];

/**
 * Coerce a loosely-typed value into a `Date` or `null`. Accepts `Date`
 * instances, numeric timestamps, and ISO-8601 strings. Returns `null` for
 * `null`/`undefined`/empty strings and throws for anything unrecognizable.
 */
export function coerceDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.length === 0) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;

  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Build a fresh running timer snapshot for a session with the given planned
 * duration.
 * @example
 * createSessionState(25) // => { state: 'RUNNING', elapsedSeconds: 0, ... }
 */
export function createSessionState(
  plannedMinutes: number,
  sessionId?: string,
  startedAt: Date = new Date()
): FocusTimerSnapshot {
  if (!Number.isFinite(plannedMinutes) || plannedMinutes <= 0) {
    throw new TypeError('plannedMinutes must be a positive number');
  }
  if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
    throw new TypeError('startedAt must be a valid Date');
  }

  const endsAt = new Date(startedAt.getTime() + plannedMinutes * 60000);
  return {
    sessionId: sessionId ?? '',
    state: 'RUNNING',
    startedAt,
    endsAt,
    elapsedSeconds: 0,
    remainingSeconds: plannedMinutes * 60,
    progressPercentage: 0,
  };
}

/**
 * Compute the final duration of a session from its last timer snapshot. The
 * result is capped at the planned duration; `truncated` reports whether the
 * timer ran past its scheduled end.
 * @example
 * completeSession({ elapsedSeconds: 2400, remainingSeconds: 0, ... }) // => { durationSeconds: 1500, truncated: true }
 */
export function completeSession(
  snapshot: FocusTimerSnapshot,
  now: Date = new Date()
): SessionCompletion {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date');
  }

  const elapsedAtSnapshot = safeNumber(snapshot.elapsedSeconds, 0);
  const rawElapsedSeconds = snapshot.startedAt
    ? (now.getTime() - snapshot.startedAt.getTime()) / 1000
    : elapsedAtSnapshot;

  const plannedSeconds = elapsedAtSnapshot + safeNumber(snapshot.remainingSeconds, 0);
  const capped = Math.min(rawElapsedSeconds, plannedSeconds);
  return {
    durationSeconds: Math.max(0, Math.round(capped)),
    truncated: rawElapsedSeconds > plannedSeconds,
  };
}

/**
 * Mark a session as cancelled, freezing the timer at its current elapsed time.
 */
export function abandonSession(
  snapshot: FocusTimerSnapshot,
  now: Date = new Date()
): FocusTimerSnapshot {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date');
  }

  const elapsedSeconds = snapshot.startedAt
    ? Math.max(
        safeNumber(snapshot.elapsedSeconds, 0),
        (now.getTime() - snapshot.startedAt.getTime()) / 1000
      )
    : safeNumber(snapshot.elapsedSeconds, 0);

  return {
    sessionId: snapshot.sessionId,
    state: 'CANCELLED',
    startedAt: snapshot.startedAt,
    endsAt: now,
    elapsedSeconds: Math.round(elapsedSeconds),
    remainingSeconds: 0,
    progressPercentage: 100,
  };
}

/**
 * Rehydrate a timer snapshot from an untrusted source (storage, query params).
 * Throws when required numeric/date fields are missing or malformed. Unknown
 * timer states are rejected.
 */
export function restoreSession(raw: unknown): FocusTimerSnapshot {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('raw snapshot must be an object');
  }
  const record = raw as Record<string, unknown>;

  if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) {
    throw new TypeError('sessionId is required');
  }
  if (!isValidFocusTimerState(record.state)) {
    throw new TypeError(`unsupported timer state: ${String(record.state)}`);
  }

  const startedAt = coerceDate(record.startedAt);
  const endsAt = coerceDate(record.endsAt);
  if (startedAt === null) {
    throw new TypeError('startedAt must be a valid date');
  }

  const elapsedSeconds = safeNumber(record.elapsedSeconds, -1);
  const remainingSeconds = safeNumber(record.remainingSeconds, -1);
  if (elapsedSeconds < 0 || remainingSeconds < 0) {
    throw new TypeError('elapsedSeconds and remainingSeconds must be positive');
  }

  const plannedSeconds = elapsedSeconds + remainingSeconds;
  const progressPercentage =
    plannedSeconds > 0
      ? Math.min(100, Math.max(0, (elapsedSeconds / plannedSeconds) * 100))
      : 0;

  return {
    sessionId: record.sessionId,
    state: record.state,
    startedAt,
    endsAt,
    elapsedSeconds,
    remainingSeconds,
    progressPercentage,
  };
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}