/**
 * Focus timer machine — the pure reducer behind the whole `/focus` stage.
 *
 * The governing rule of this file: **the timer never counts down.** There is no
 * integer that gets decremented, because a throttled interval, a backgrounded
 * tab or a throttled timer callback would all make a decremented counter drift,
 * and a focus timer that lies about how long you have left is worse than no
 * timer. State is a set of absolute instants (`startedAt`, `endsAt`,
 * `pausedAt`), and every readout is derived from the wall clock at the moment it
 * is read. A tab that was frozen for an hour wakes up and shows the truth.
 *
 * Everything here is a pure function over `(state, action)`. No clock, no
 * storage, no fetch, no React. `now` is always an explicit argument for exactly
 * that reason, and it is what makes the whole file testable — including the
 * cases that are impossible to reproduce by hand, like a countdown that expired
 * while the machine was asleep.
 *
 * The one piece of non-local logic is *which phase comes next*, and that lives
 * in `lib/focus/pomodoro.ts`. This file adapts it to user settings rather than
 * re-deriving it.
 */

import type { FocusSessionType } from '@/constants/prisma-enums';
import {
  type FocusMode,
  sessionTypeToFocusMode,
} from '@/lib/focus/type-backfill';
import { STOPWATCH_STALE_MS, elapsedWorkingMs, settleSession } from '@/lib/focus/settle';

const MS_PER_MINUTE = 60_000;

/** Bounds on a user-chosen countdown length. Matches the input's max. */
export const MIN_PLANNED_MINUTES = 1;
export const MAX_PLANNED_MINUTES = 180;

/**
 * How a session ended, from the machine's point of view.
 *
 * `finished` is distinct from `idle` because it drives two different UI
 * reactions: `idle` is "nothing to report", `finished` is "something just
 * happened, offer the next phase".
 */
export type FocusStatus = 'idle' | 'running' | 'paused' | 'finished';

/** Why the last attempt ended. Drives the safe-stop confirm and the stats. */
export type FocusEndReason = 'completed' | 'aborted' | null;

export interface FocusMachineSettings {
  /** Countdown length for a focus block, in minutes. */
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Focus blocks before the long break. */
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_FOCUS_SETTINGS: FocusMachineSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundEnabled: true,
};

/**
 * The whole machine state.
 *
 * Every time-bearing field is absolute milliseconds-since-epoch. `plannedMs` is
 * the timebox and `pausedTotalMs` the accumulated pause, so the remaining time
 * is always `max(0, endsAt - now)` for a running countdown — never a stored
 * remainder that could go stale.
 */
export interface FocusMachineState {
  /** Server row id, or null before the first session is started. */
  sessionId: string | null;
  /** The mode currently loaded into the dial (may differ from a saved session). */
  mode: FocusMode;
  status: FocusStatus;
  /** Absolute start of the current attempt. */
  startedAt: number | null;
  /** Absolute deadline for a countdown. Null for a stopwatch and while idle. */
  endsAt: number | null;
  /** Absolute instant the current pause began. */
  pausedAt: number | null;
  /** Accumulated pause across all pauses of this attempt. */
  pausedTotalMs: number;
  /** The timebox for the current attempt. `0` means open-ended. */
  plannedMs: number;
  /** Completed focus blocks in the current chain. */
  cycles: number;
  /** How the last attempt ended. */
  endReason: FocusEndReason;
  /** What the user is working on; persisted as the session `title`. */
  intent: string;
  categoryId: string | null;
  /** Set when a save failed, so the UI can offer Retry. */
  error: string | null;
}

export type FocusAction =
  | { type: 'set-mode'; mode: FocusMode }
  | { type: 'set-duration'; minutes: number }
  | { type: 'set-intent'; intent: string }
  | { type: 'set-category'; categoryId: string | null }
  | { type: 'start'; sessionId?: string | null }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'finish'; reason: Extract<FocusEndReason, 'completed' | 'aborted'> }
  | { type: 'adopt'; state: Partial<FocusMachineState> }
  | { type: 'set-error'; error: string | null };

export function createInitialState(): FocusMachineState {
  return {
    sessionId: null,
    mode: 'focus',
    status: 'idle',
    startedAt: null,
    endsAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
    plannedMs: DEFAULT_FOCUS_SETTINGS.focusMinutes * MS_PER_MINUTE,
    cycles: 0,
    endReason: null,
    intent: '',
    categoryId: null,
    error: null,
  };
}

/** Clamp a user-chosen countdown length into the allowed range. */
export function clampPlannedMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_PLANNED_MINUTES;
  return Math.min(
    MAX_PLANNED_MINUTES,
    Math.max(MIN_PLANNED_MINUTES, Math.round(minutes))
  );
}

/** The timebox for a mode under the given settings. `0` for a stopwatch. */
export function plannedMsForMode(mode: FocusMode, settings: FocusMachineSettings): number {
  switch (mode) {
    case 'focus':
      return clampPlannedMinutes(settings.focusMinutes) * MS_PER_MINUTE;
    case 'short-break':
      return clampPlannedMinutes(settings.shortBreakMinutes) * MS_PER_MINUTE;
    case 'long-break':
      return clampPlannedMinutes(settings.longBreakMinutes) * MS_PER_MINUTE;
    case 'stopwatch':
      return 0;
  }
}

/**
 * The mode that follows `mode`.
 *
 * A focus block advances the cycle counter; a break returns to focus. A
 * stopwatch has no successor — the user has to choose, because there is nothing
 * sensible to auto-start after an arbitrarily long manual measurement.
 */
export function nextModeAfter(
  mode: FocusMode,
  cyclesCompleted: number,
  settings: FocusMachineSettings
): FocusMode {
  if (mode === 'stopwatch') return 'focus';
  if (mode !== 'focus') return 'focus';
  const perLong = Math.max(1, settings.cyclesBeforeLongBreak);
  return cyclesCompleted % perLong === 0 ? 'long-break' : 'short-break';
}

/**
 * Whether the countdown has run out.
 *
 * Derived, never stored: `now >= endsAt` is the whole test, which is why a
 * throttled tab cannot make this lie.
 */
export function isExpired(state: FocusMachineState, now: number): boolean {
  return state.status === 'running' && state.endsAt !== null && now >= state.endsAt;
}

/** Milliseconds left in a countdown. Zero once expired. */
export function remainingMs(state: FocusMachineState, now: number): number {
  if (state.endsAt === null) return 0;
  if (state.status === 'paused') {
    return Math.max(0, state.endsAt - (state.pausedAt ?? now));
  }
  if (state.status !== 'running') return state.plannedMs;
  return Math.max(0, state.endsAt - now);
}

/**
 * Milliseconds of actual work done in this attempt, excluding pauses.
 *
 * For a running countdown this is `planned - remaining`, which is equal to
 * `now - startedAt - pausedTotal` because `endsAt` was derived that way — so the
 * two formulations agree and a paused span is never billed as focus.
 */
export function elapsedMs(state: FocusMachineState, now: number): number {
  if (state.startedAt === null) return 0;
  if (state.status === 'paused') {
    return elapsedWorkingMs(
      {
        startedAt: state.startedAt,
        pausedAt: state.pausedAt,
        pausedTotalMs: state.pausedTotalMs,
        plannedMs: state.plannedMs,
      },
      state.pausedAt ?? now
    );
  }
  if (state.status === 'running' || state.status === 'finished') {
    return elapsedWorkingMs(
      {
        startedAt: state.startedAt,
        pausedAt: null,
        pausedTotalMs: state.pausedTotalMs,
        plannedMs: state.plannedMs,
      },
      state.status === 'finished' ? state.endsAt ?? now : now
    );
  }
  return 0;
}

/** Ring progress in `[0, 1]`. A stopwatch has no end, so it fills nothing. */
export function progressFraction(state: FocusMachineState, now: number): number {
  if (state.plannedMs <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedMs(state, now) / state.plannedMs));
}

/**
 * The dominant input for `settleSession`, so the machine and the server cannot
 * disagree about whether a row is stale.
 */
export function settleInputFor(state: FocusMachineState) {
  return {
    startedAt: state.startedAt ?? 0,
    pausedAt: state.pausedAt,
    pausedTotalMs: state.pausedTotalMs,
    plannedMs: state.plannedMs,
  };
}

/**
 * `formatCountdown`-compatible string for a duration in ms.
 *
 * Kept here rather than in a component because the same three call sites (dial,
 * floating bar, document title) must never disagree about the width of the
 * string they render, and a shared formatter is cheaper to reason about than a
 * shared convention.
 */
export function formatClock(ms: number, forceHours = false): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0 || forceHours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * `HH:MM:SS.cc` — stopwatch only, because a centisecond readout is meaningless
 * for a countdown and visually noisy.
 */
export function formatStopwatch(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const centiseconds = Math.floor((clamped % 1000) / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

/** The single string the dial, the bar and the title all render. */
export function formatForState(state: FocusMachineState, now: number): string {
  return state.mode === 'stopwatch'
    ? formatStopwatch(elapsedMs(state, now))
    : formatClock(remainingMs(state, now), state.plannedMs >= 60 * 60 * MS_PER_MINUTE);
}

/**
 * The reducer.
 *
 * Notable design points:
 *
 *   - `sync-now` is the only action that reads `now`, and it never *stores* it.
 *     A tick cannot therefore cause a render loop: two ticks in the same
 *     millisecond produce the same state, so React bails out of the update.
 *   - `finish` is idempotent-ish by construction: once `status` is not `running`
 *     or `paused`, `finish` returns the state unchanged, so a completion timeout
 *     racing with a manual Stop cannot double-count the cycle.
 *   - Every action clears `error`, so a successful interaction always clears a
 *     previous save failure rather than leaving a stale message next to a
 *     working timer.
 */
export function focusReducer(
  state: FocusMachineState,
  action: FocusAction,
  now: number
): FocusMachineState {
  switch (action.type) {
    case 'set-mode': {
      if (state.status === 'running' || state.status === 'paused') {
        // The caller must confirm first. Refusing here means a future caller
        // cannot bypass the confirm by dispatching directly.
        return state;
      }
      return { ...state, mode: action.mode, endReason: null, error: null };
    }

    case 'set-duration': {
      if (state.status === 'running' || state.status === 'paused') return state;
      return { ...state, plannedMs: action.minutes * MS_PER_MINUTE, error: null };
    }

    case 'set-intent':
      return { ...state, intent: action.intent };

    case 'set-category':
      return { ...state, categoryId: action.categoryId };

    case 'start': {
      if (state.status === 'running' || state.status === 'paused') return state;
      // A fresh start always begins at `now`. Inheriting `startedAt` would let a
      // restored-but-idle state silently claim elapsed time it never ran.
      const openEnded = state.plannedMs <= 0;
      return {
        ...state,
        sessionId: action.sessionId !== undefined ? action.sessionId : state.sessionId,
        status: 'running',
        startedAt: now,
        endsAt: openEnded ? null : now + state.plannedMs,
        pausedAt: null,
        pausedTotalMs: 0,
        endReason: null,
        error: null,
      };
    }

    case 'pause': {
      if (state.status !== 'running') return state;
      return { ...state, status: 'paused', pausedAt: now, error: null };
    }

    case 'resume': {
      if (state.status !== 'paused') return state;
      const pauseSpan = Math.max(0, now - (state.pausedAt ?? now));
      const pausedTotalMs = state.pausedTotalMs + pauseSpan;
      // Push the deadline out by exactly the span just consumed, so the countdown
      // resumes where it stopped instead of losing that time. A stopwatch has no
      // deadline to shift.
      const endsAt = state.plannedMs > 0 ? (state.endsAt ?? now) + pauseSpan : null;
      return { ...state, status: 'running', pausedAt: null, pausedTotalMs, endsAt, error: null };
    }

    case 'reset': {
      const base = createInitialState();
      return {
        ...base,
        mode: state.mode,
        cycles: state.cycles,
        intent: state.intent,
        categoryId: state.categoryId,
        plannedMs: state.plannedMs,
      };
    }

    case 'finish': {
      if (state.status !== 'running' && state.status !== 'paused') return state;
      const cycles =
        state.mode === 'focus' && action.reason === 'completed'
          ? state.cycles + 1
          : state.cycles;
      return {
        ...state,
        status: 'finished',
        startedAt: null,
        endsAt: null,
        pausedAt: null,
        endReason: action.reason,
        cycles,
        error: null,
      };
    }

    case 'adopt':
      return { ...state, ...action.state };

    case 'set-error':
      return { ...state, error: action.error };

    default:
      return state;
  }
}

/**
 * Resolve a server row into the machine state a second tab should adopt.
 *
 * Used for cross-tab adoption and for the `/api/focus/active` refetch. Runs the
 * same `settleSession` the server runs, so if the row has gone stale both sides
 * reach the same conclusion instead of one showing a live timer and the other
 * showing nothing.
 */
export function adoptFromServerRow(
  row: {
    id: string;
    type: FocusSessionType;
    startedAt: string | number;
    pausedAt?: string | number | null;
    pausedTotalSeconds?: number | null;
    plannedDuration: number;
    title?: string | null;
    categoryId?: string | null;
  },
  now: number,
  plannedMsOverride?: number
): FocusMachineState {
  const mode = sessionTypeToFocusMode(row.type);
  const startedAt =
    typeof row.startedAt === 'number' ? row.startedAt : Date.parse(row.startedAt);
  const pausedAtRaw = row.pausedAt ?? null;
  const pausedAt =
    pausedAtRaw === null
      ? null
      : typeof pausedAtRaw === 'number'
        ? pausedAtRaw
        : Date.parse(pausedAtRaw);
  const plannedMs =
    plannedMsOverride ??
    (mode === 'stopwatch' ? 0 : Math.max(1, row.plannedDuration) * MS_PER_MINUTE);

  const input = {
    startedAt,
    pausedAt: Number.isFinite(pausedAt) ? pausedAt : null,
    pausedTotalMs: Math.max(0, (row.pausedTotalSeconds ?? 0) * 1000),
    plannedMs,
  };
  const settled = settleSession(input, now);

  if (settled.action === 'complete' || settled.action === 'abort') {
    // The row is over. Do not adopt a dead session as a live timer — hand back
    // the same idle state a fresh load would show, carrying the intent across
    // so the user's next session is not silently uncategorised.
    return {
      ...createInitialState(),
      mode,
      plannedMs,
      intent: row.title ?? '',
      categoryId: row.categoryId ?? null,
    };
  }

  const isPaused = settled.action === 'paused';
  const validPausedAt = Number.isFinite(pausedAt) ? pausedAt : null;

  return {
    ...createInitialState(),
    sessionId: row.id,
    mode,
    status: isPaused ? 'paused' : 'running',
    startedAt,
    pausedAt: isPaused ? validPausedAt : null,
    pausedTotalMs: input.pausedTotalMs,
    plannedMs,
    // The deadline is reconstructed as `startedAt + planned + pausedTotal` rather
    // than taken from a client-sent `endsAt`: it is the only value the server can
    // independently verify, and reconstructing it means a tampered or stale
    // localStorage value cannot shorten a session. A stopwatch has no deadline.
    endsAt: plannedMs > 0 ? startedAt + plannedMs + input.pausedTotalMs : null,
    intent: row.title ?? '',
    categoryId: row.categoryId ?? null,
  };
}

/**
 * Guard against a persisted stopwatch that would never be reclaimed.
 *
 * The server caps an abandoned stopwatch at 12h; this mirrors that on the client
 * so the dial shows the same ceiling the row will be settled at, rather than
 * counting to 40 hours in a forgotten tab.
 */
export function stopwatchCeilingMs(): number {
  return STOPWATCH_STALE_MS;
}
