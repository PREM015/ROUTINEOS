/**
 * Lazy settlement of a focus session row — the pure core of
 * `FocusService.getActiveSession`.
 *
 * The problem: a focus row is created when the timer starts and is only closed
 * by the browser. If the tab is closed, the laptop sleeps, or the network drops
 * at second 23 of a 25-minute countdown, no `complete` request ever arrives and
 * the row stays `completedAt: null, abortedAt: null` forever. That shape is
 * exactly what `findActiveByUserId` uses to mean "a session is currently
 * running", so the row was reported as live indefinitely — and because the old
 * `getActiveSession` also refused anything that did not start *today*, a row
 * from yesterday simply vanished while still counting as "running" to the
 * database.
 *
 * The fix is to never trust the absence of a completion signal. Every read of
 * the active session re-derives, from timestamps alone, what must have happened,
 * and the caller writes that conclusion. This module is that derivation, with no
 * database and no clock of its own (`now` is always an argument) so it is fully
 * unit-testable.
 *
 * Three cases, in priority order:
 *
 *   1. PAUSED   — `pausedAt` set. Settle nothing; report the frozen elapsed
 *                 time at the instant of the pause. A paused session is not
 *                 stale, it is waiting for the user.
 *   2. COUNTDOWN — `plannedMs` is known and `now >= startedAt + planned +
 *                 pausedTotal`. The user closed the tab but the timebox ran
 *                 out, which is indistinguishable from having completed it.
 *                 Complete it, `actual = planned`.
 *   3. STOPWATCH — `plannedMs` is 0 (no end). There is no deadline to pass, so
 *                 "stale" has to be a wall-clock judgement. Past
 *                 `STOPWATCH_STALE_MS` (12h) the row is a forgotten tab, not a
 *                 session: abort it and cap the recorded duration.
 *
 * `STOPWATCH_STALE_MS` and `STOPWATCH_MAX_MS` are deliberately the same 12
 * hours, so a session can be neither capped below its cap nor aborted after its
 * cap. Two constants would invite an off-by-one where a row is capped at 11h59m
 * and then aborted at 12h.
 */

/** 12 hours. A stopwatch older than this is a forgotten tab, not a session. */
export const STOPWATCH_STALE_MS = 12 * 60 * 60 * 1000;

/** The duration ceiling applied to an abandoned stopwatch. */
export const STOPWATCH_MAX_MS = STOPWATCH_STALE_MS;

const MS_PER_MINUTE = 60_000;

export interface SettleInput {
  /** Absolute start of the *attempt* (i.e. of the whole session row). */
  startedAt: number;
  /** The instant the current pause began, or null when running. */
  pausedAt: number | null;
  /** Total time spent paused before this attempt, in milliseconds. */
  pausedTotalMs: number;
  /**
   * The timebox in milliseconds. `0` means open-ended (stopwatch).
   *
   * A countdown always has a positive planned duration, so `0` is an
   * unambiguous sentinel rather than a guess.
   */
  plannedMs: number;
}

export type SettleAction = 'keep-running' | 'complete' | 'abort' | 'paused';

export interface SettleResult {
  action: SettleAction;
  /**
   * Elapsed *working* time in milliseconds, excluding all paused spans.
   *
   * Never negative, and for `complete` it is exactly `plannedMs`.
   */
  elapsedMs: number;
  /** Elapsed working time in whole minutes, floored at 0. */
  elapsedMinutes: number;
  /**
   * The instant to stamp on `completedAt` / `abortedAt`, in ms epoch.
   *
   * For a countdown that ran out this is the deadline, not `now`: a tab that
   * was closed for six hours still finished its 25 minutes at T+25m, and
   * stamping `completedAt` with the reopen time would put the session on the
   * wrong day in every per-day bucket.
   */
  endedAt: number;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Elapsed working time for a row, with the current pause span excluded.
 *
 * When `pausedAt` is set the clock stops there, so a session paused for an hour
 * reports the minute it reached rather than an hour of phantom work.
 */
export function elapsedWorkingMs(input: SettleInput, now: number): number {
  const { startedAt, pausedAt, pausedTotalMs } = input;
  if (!Number.isFinite(startedAt)) return 0;
  const reference = pausedAt !== null && Number.isFinite(pausedAt) ? pausedAt : now;
  return Math.max(0, reference - startedAt - clampNonNegative(pausedTotalMs));
}

/**
 * The absolute instant a countdown's timebox runs out.
 *
 * `null` for a stopwatch, which has no deadline.
 */
export function deadlineFor(input: SettleInput): number | null {
  if (!(input.plannedMs > 0)) return null;
  return input.startedAt + input.plannedMs + clampNonNegative(input.pausedTotalMs);
}

/**
 * Decide what must have happened to this row by `now`.
 *
 * See the module docstring for the ordering rationale. Note that a paused row
 * short-circuits before the deadline check: a session the user deliberately
 * paused past its own deadline is not "completed", it is waiting.
 */
export function settleSession(input: SettleInput, now: number): SettleResult {
  const { plannedMs } = input;

  // Case 1 — paused. Nothing to settle; freeze at the pause instant.
  if (input.pausedAt !== null && Number.isFinite(input.pausedAt)) {
    const elapsedMs = elapsedWorkingMs(input, input.pausedAt);
    return {
      action: 'paused',
      elapsedMs,
      elapsedMinutes: Math.floor(elapsedMs / MS_PER_MINUTE),
      endedAt: input.pausedAt,
    };
  }

  // Case 2 — countdown whose deadline has passed.
  const deadline = deadlineFor(input);
  if (deadline !== null && now >= deadline) {
    const elapsedMs = Math.max(0, plannedMs);
    return {
      action: 'complete',
      elapsedMs,
      elapsedMinutes: Math.floor(elapsedMs / MS_PER_MINUTE),
      endedAt: deadline,
    };
  }

  // Case 3 — open-ended and older than the staleness bound.
  if (deadline === null) {
    const elapsedMs = elapsedWorkingMs(input, now);
    if (elapsedMs >= STOPWATCH_STALE_MS) {
      return {
        action: 'abort',
        elapsedMs: STOPWATCH_MAX_MS,
        elapsedMinutes: Math.floor(STOPWATCH_MAX_MS / MS_PER_MINUTE),
        endedAt: input.startedAt + STOPWATCH_MAX_MS + clampNonNegative(input.pausedTotalMs),
      };
    }
    return {
      action: 'keep-running',
      elapsedMs,
      elapsedMinutes: Math.floor(elapsedMs / MS_PER_MINUTE),
      endedAt: now,
    };
  }

  // Case 4 — countdown still in progress.
  const elapsedMs = elapsedWorkingMs(input, now);
  return {
    action: 'keep-running',
    elapsedMs,
    elapsedMinutes: Math.floor(elapsedMs / MS_PER_MINUTE),
    endedAt: now,
  };
}
