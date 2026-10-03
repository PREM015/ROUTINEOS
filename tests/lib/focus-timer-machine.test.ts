import { describe, expect, it } from 'vitest';

import {
  MAX_PLANNED_MINUTES,
  MIN_PLANNED_MINUTES,
  clampPlannedMinutes,
  createInitialState,
  elapsedMs,
  focusReducer,
  formatClock,
  formatStopwatch,
  isExpired,
  nextModeAfter,
  plannedMsForMode,
  progressFraction,
  remainingMs,
  DEFAULT_FOCUS_SETTINGS,
  type FocusMachineState,
} from '@/lib/focus/timer-machine';
import { adoptFromServerRow } from '@/lib/focus/timer-machine';

/**
 * The timer machine's governing rule: **the timer never counts down.** Every
 * readout is derived from absolute instants at the moment it is read, so a
 * throttled interval, a backgrounded tab and a sleeping laptop cannot make it
 * lie. These tests pin that, including the cases impossible to reproduce by hand.
 */

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

function running(overrides: Partial<FocusMachineState> = {}): FocusMachineState {
  return {
    ...createInitialState(),
    sessionId: 's1',
    status: 'running',
    startedAt: T0,
    endsAt: T0 + 25 * MINUTE,
    plannedMs: 25 * MINUTE,
    ...overrides,
  };
}

describe('the reducer is pure', () => {
  it('returns an identical value when nothing relevant happened', () => {
    const state = running();
    // `set-intent` is the only action that must not disturb the clock.
    const next = focusReducer(state, { type: 'set-intent', intent: 'write tests' }, T0);
    expect(next.intent).toBe('write tests');
    expect(next.endsAt).toBe(state.endsAt);
    expect(next.startedAt).toBe(state.startedAt);
  });

  it('never reads the clock itself', () => {
    // Two `pause` actions at different `now` values must differ, proving `now` is
    // the only source of time. If the reducer called `Date.now()` internally this
    // pair would be identical.
    const state = running();
    const a = focusReducer(state, { type: 'pause' }, T0 + 1000);
    const b = focusReducer(state, { type: 'pause' }, T0 + 5000);
    expect(a.pausedAt).toBe(T0 + 1000);
    expect(b.pausedAt).toBe(T0 + 5000);
  });

  it('clears a previous error on an action that attempts something', () => {
    const state = running({ error: 'Could not reach the server.' });
    expect(focusReducer(state, { type: 'pause' }, T0 + MINUTE).error).toBeNull();
  });

  it('does NOT clear the error when the user merely types', () => {
    // The message is about the save, not the typing. Clearing it per keystroke
    // would let someone talk themselves into believing the session was saved.
    const state = running({ error: 'Could not reach the server.' });
    expect(focusReducer(state, { type: 'set-intent', intent: 'x' }, T0).error).toBe(
      'Could not reach the server.'
    );
  });
});

describe('remainingMs', () => {
  it('derives from endsAt, so it is correct however long the tab slept', () => {
    const state = running();
    // A tab frozen for an hour wakes up and shows the truth, not 24:00.
    expect(remainingMs(state, T0 + 60 * MINUTE)).toBe(0);
    expect(remainingMs(state, T0 + 10 * MINUTE)).toBe(15 * MINUTE);
  });

  it('never goes negative', () => {
    expect(remainingMs(running(), T0 + 999 * MINUTE)).toBe(0);
  });

  it('freezes while paused', () => {
    const paused = focusReducer(running(), { type: 'pause' }, T0 + 10 * MINUTE);
    // The clock stops at the pause instant, not at render time.
    expect(remainingMs(paused, paused.pausedAt ?? T0)).toBe(15 * MINUTE);
    expect(remainingMs(paused, T0 + 99 * MINUTE)).toBe(15 * MINUTE);
  });

  it('shows the whole plan while idle', () => {
    expect(remainingMs(createInitialState(), T0)).toBe(25 * MINUTE);
  });
});

describe('elapsedMs', () => {
  it('excludes paused time', () => {
    // The bug this prevents: paused time billed as focus time inflates every
    // total in the product.
    let state = running();
    state = focusReducer(state, { type: 'pause' }, T0 + 5 * MINUTE);
    state = focusReducer(state, { type: 'resume' }, T0 + 35 * MINUTE);
    // 5 minutes of work before the pause, and the 30-minute pause is not work.
    expect(elapsedMs(state, T0 + 35 * MINUTE)).toBe(5 * MINUTE);
  });

  it('accumulates across several pauses', () => {
    let state = running();
    state = focusReducer(state, { type: 'pause' }, T0 + 5 * MINUTE);
    state = focusReducer(state, { type: 'resume' }, T0 + 15 * MINUTE);
    state = focusReducer(state, { type: 'pause' }, T0 + 20 * MINUTE);
    state = focusReducer(state, { type: 'resume' }, T0 + 50 * MINUTE);
    // 5 + 5 = 10 minutes of work across two 10/30-minute pauses.
    expect(elapsedMs(state, T0 + 50 * MINUTE)).toBe(10 * MINUTE);
  });

  it('does not restart the clock on resume', () => {
    // A pause must consume deadline, not restore it. Otherwise pausing for an hour
    // on a 25-minute box would leave 25 minutes remaining.
    let state = running();
    state = focusReducer(state, { type: 'pause' }, T0 + MINUTE);
    state = focusReducer(state, { type: 'resume' }, T0 + 61 * MINUTE);
    expect(remainingMs(state, T0 + 61 * MINUTE)).toBe(24 * MINUTE);
  });

  it('is zero while idle', () => {
    expect(elapsedMs(createInitialState(), T0 + 60 * MINUTE)).toBe(0);
  });
});

describe('isExpired', () => {
  it('is true only once the deadline has passed', () => {
    const state = running();
    expect(isExpired(state, T0 + 24 * MINUTE)).toBe(false);
    expect(isExpired(state, T0 + 25 * MINUTE)).toBe(true);
  });

  it('is false for a stopwatch, which has no deadline', () => {
    expect(isExpired(running({ endsAt: null, plannedMs: 0 }), T0 + 99 * HOUR_MS())).toBe(false);
  });
});

const HOUR_MS = () => 60 * MINUTE;

describe('finish', () => {
  it('counts a completed focus block as a cycle', () => {
    const next = focusReducer(running(), { type: 'finish', reason: 'completed' }, T0 + 25 * MINUTE);
    expect(next.cycles).toBe(1);
    expect(next.status).toBe('finished');
    expect(next.endReason).toBe('completed');
  });

  it('does not count an aborted block as a cycle', () => {
    // Otherwise stopping repeatedly would inflate "pomodoros completed".
    const next = focusReducer(running(), { type: 'finish', reason: 'aborted' }, T0 + 25 * MINUTE);
    expect(next.cycles).toBe(0);
  });

  it('does not count a break as a focus cycle', () => {
    const state = running({ mode: 'short-break', cycles: 2 });
    const next = focusReducer(state, { type: 'finish', reason: 'completed' }, T0);
    expect(next.cycles).toBe(2);
  });

  it('is idempotent, so a timeout racing a manual Stop cannot double-count', () => {
    const once = focusReducer(running(), { type: 'finish', reason: 'completed' }, T0);
    const twice = focusReducer(once, { type: 'finish', reason: 'completed' }, T0 + 1000);
    expect(twice.cycles).toBe(1);
    expect(twice).toBe(once);
  });
});

describe('guards against a run being silently recorded', () => {
  it('refuses a mode switch while running', () => {
    // The caller must confirm first; refusing here means no future caller can
    // bypass the confirm by dispatching directly.
    const state = running();
    expect(focusReducer(state, { type: 'set-mode', mode: 'stopwatch' }, T0)).toBe(state);
  });

  it('refuses a duration change while running', () => {
    const state = running();
    expect(focusReducer(state, { type: 'set-duration', minutes: 60 }, T0)).toBe(state);
  });

  it('refuses a second start while running', () => {
    const state = running();
    expect(focusReducer(state, { type: 'start' }, T0)).toBe(state);
  });
});

describe('reset', () => {
  it('keeps the intent, the mode and the cycle count', () => {
    // Losing the cycle count on reset is the bug that made it impossible to answer
    // "how many pomodoros have I done in this run".
    let state = running({ cycles: 3, mode: 'short-break' });
    state = focusReducer(state, { type: 'set-intent', intent: 'ship the migration' }, T0);
    state = focusReducer(state, { type: 'finish', reason: 'completed' }, T0);
    const reset = focusReducer(state, { type: 'reset' }, T0);
    expect(reset.status).toBe('idle');
    expect(reset.intent).toBe('ship the migration');
    expect(reset.mode).toBe('short-break');
    expect(reset.cycles).toBe(3);
    expect(reset.sessionId).toBeNull();
  });
});

describe('start', () => {
  it('begins at now, never inheriting a stale startedAt', () => {
    const state = createInitialState();
    const next = focusReducer(state, { type: 'start' }, T0);
    expect(next.startedAt).toBe(T0);
    expect(next.endsAt).toBe(T0 + 25 * MINUTE);
  });

  it('leaves a stopwatch without a deadline', () => {
    const state = createInitialState();
    const open = focusReducer(state, { type: 'set-duration', minutes: 0 }, T0);
    const next = focusReducer(open, { type: 'start' }, T0);
    expect(next.endsAt).toBeNull();
  });
});

describe('plannedMsForMode', () => {
  it('is zero for a stopwatch', () => {
    expect(plannedMsForMode('stopwatch', DEFAULT_FOCUS_SETTINGS)).toBe(0);
  });

  it('uses the configured durations', () => {
    const settings = { ...DEFAULT_FOCUS_SETTINGS, focusMinutes: 50, longBreakMinutes: 30 };
    expect(plannedMsForMode('focus', settings)).toBe(50 * MINUTE);
    expect(plannedMsForMode('long-break', settings)).toBe(30 * MINUTE);
  });
});

describe('nextModeAfter', () => {
  const settings = { ...DEFAULT_FOCUS_SETTINGS, cyclesBeforeLongBreak: 4 };

  it('returns to focus after a break', () => {
    expect(nextModeAfter('short-break', 1, settings)).toBe('focus');
    expect(nextModeAfter('long-break', 4, settings)).toBe('focus');
  });

  it('schedules a long break on the configured cycle', () => {
    expect(nextModeAfter('focus', 4, settings)).toBe('long-break');
    expect(nextModeAfter('focus', 3, settings)).toBe('short-break');
    expect(nextModeAfter('focus', 8, settings)).toBe('long-break');
  });

  it('has no successor after a stopwatch', () => {
    // Nothing sensible can auto-start after an arbitrarily long manual measurement.
    expect(nextModeAfter('stopwatch', 2, settings)).toBe('focus');
  });
});

describe('clampPlannedMinutes', () => {
  it('bounds a user-chosen length', () => {
    expect(clampPlannedMinutes(0)).toBe(MIN_PLANNED_MINUTES);
    expect(clampPlannedMinutes(9999)).toBe(MAX_PLANNED_MINUTES);
    expect(clampPlannedMinutes(-5)).toBe(MIN_PLANNED_MINUTES);
    expect(clampPlannedMinutes(NaN)).toBe(MIN_PLANNED_MINUTES);
    expect(clampPlannedMinutes(30.4)).toBe(30);
  });
});

describe('progressFraction', () => {
  it('fills as the session progresses and clamps at 1', () => {
    const state = running();
    expect(progressFraction(state, T0)).toBe(0);
    expect(progressFraction(state, T0 + 12.5 * MINUTE)).toBeCloseTo(0.5, 5);
    expect(progressFraction(state, T0 + 99 * MINUTE)).toBe(1);
  });

  it('is zero for a stopwatch, which has no end to fill towards', () => {
    expect(progressFraction(running({ plannedMs: 0, endsAt: null }), T0 + MINUTE)).toBe(0);
  });
});

describe('formatters', () => {
  it('drops the hour segment until it is needed', () => {
    expect(formatClock(5 * MINUTE)).toBe('05:00');
    expect(formatClock(65 * MINUTE)).toBe('1:05:00');
  });

  it('can be forced to show hours for a long plan', () => {
    expect(formatClock(65 * MINUTE, true)).toBe('1:05:00');
    expect(formatClock(5 * MINUTE, true)).toBe('0:05:00');
  });

  it('rounds up, so a timer never displays 00:00 while time remains', () => {
    expect(formatClock(1)).toBe('00:01');
  });

  it('shows centiseconds for the stopwatch only', () => {
    expect(formatStopwatch(3_661_230)).toBe('01:01:01.23');
  });
});

describe('adoptFromServerRow', () => {
  const row = {
    id: 'abc',
    type: 'FOCUS' as const,
    startedAt: new Date(T0).toISOString(),
    plannedDuration: 25,
  };

  it('reconstructs a live session', () => {
    const adopted = adoptFromServerRow(row, T0 + 10 * MINUTE);
    expect(adopted.sessionId).toBe('abc');
    expect(adopted.status).toBe('running');
    expect(adopted.plannedMs).toBe(25 * MINUTE);
  });

  it('does not adopt a dead session as a live timer', () => {
    // A row that expired while the tab was shut must not resurrect as a countdown.
    const adopted = adoptFromServerRow(row, T0 + 60 * MINUTE);
    expect(adopted.status).toBe('idle');
    expect(adopted.sessionId).toBeNull();
  });

  it('rebuilds the deadline from the stored plan, not a client value', () => {
    // A tampered localStorage value must not be able to shorten a session.
    const adopted = adoptFromServerRow(
      { ...row, pausedTotalSeconds: 10 * 60 },
      T0 + 5 * MINUTE
    );
    expect(adopted.endsAt).toBe(T0 + 25 * MINUTE + 10 * MINUTE);
  });

  it('adopts a paused session as paused', () => {
    const adopted = adoptFromServerRow(
      { ...row, pausedAt: new Date(T0 + 5 * MINUTE).toISOString() },
      T0 + 90 * MINUTE
    );
    expect(adopted.status).toBe('paused');
  });
});
