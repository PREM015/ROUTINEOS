import type { FocusTimerState } from '@/types/focus';

/**
 * Pomodoro technique logic.
 * Pure helpers for cycle computation, timeline building, and completion detection.
 */

export interface PomodoroDefaults {
  /** Minutes of focused work per cycle. */
  workMinutes: number;
  /** Minutes of a short break. */
  shortBreak: number;
  /** Minutes of a long break. */
  longBreak: number;
  /** Number of work cycles before a long break. */
  cyclesBeforeLongBreak: number;
}

export const POMODORO_DEFAULTS: Readonly<PomodoroDefaults> = {
  workMinutes: 25,
  shortBreak: 5,
  longBreak: 15,
  cyclesBeforeLongBreak: 4,
};

export type FocusPhase = 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';

export interface PomodoroSessionState {
  currentPhase: FocusPhase;
  phaseStartedAt: Date;
  completedCycles: number;
  state: FocusTimerState;
  cyclesBeforeLongBreak?: number;
}

export interface CycleComputation {
  phase: FocusPhase;
  phaseComplete: boolean;
  remainingMs: number;
  nextPhase: FocusPhase;
}

export interface TimelineSegment {
  startMinute: number;
  endMinute: number;
  phase: FocusPhase;
}

/** Runtime duration in minutes for a given phase. */
export function durationForPhase(phase: FocusPhase): number {
  switch (phase) {
    case 'SHORT_BREAK':
      return POMODORO_DEFAULTS.shortBreak;
    case 'LONG_BREAK':
      return POMODORO_DEFAULTS.longBreak;
    case 'WORK':
      return POMODORO_DEFAULTS.workMinutes;
  }
}

/**
 * Determine the phase that follows `phase`, taking completed work cycles into
 * account so a long break is scheduled every `cyclesBeforeLongBreak` pomodoros.
 */
export function nextPhaseFor(
  phase: FocusPhase,
  completedCycles: number,
  cyclesBeforeLongBreak: number = POMODORO_DEFAULTS.cyclesBeforeLongBreak
): FocusPhase {
  if (phase !== 'WORK') return 'WORK';
  return (completedCycles + 1) % cyclesBeforeLongBreak === 0
    ? 'LONG_BREAK'
    : 'SHORT_BREAK';
}

/**
 * Compute the current cycle's progress for a pomodoro session state.
 * @example
 * computeCycle({ currentPhase: 'WORK', phaseStartedAt: new Date(Date.now() - 10 * 60000), completedCycles: 0, state: 'RUNNING' })
 * // => { phase: 'WORK', phaseComplete: false, remainingMs: 900000, nextPhase: 'SHORT_BREAK' }
 */
export function computeCycle(
  sessionState: PomodoroSessionState,
  now: Date = new Date()
): CycleComputation {
  const cyclesBeforeLongBreak =
    sessionState.cyclesBeforeLongBreak ?? POMODORO_DEFAULTS.cyclesBeforeLongBreak;
  const durationMs = durationForPhase(sessionState.currentPhase) * 60000;
  const elapsedMs = Math.max(0, now.getTime() - sessionState.phaseStartedAt.getTime());
  const phaseComplete = elapsedMs >= durationMs;

  return {
    phase: sessionState.currentPhase,
    phaseComplete,
    remainingMs: Math.max(0, durationMs - elapsedMs),
    nextPhase: nextPhaseFor(
      sessionState.currentPhase,
      sessionState.completedCycles,
      cyclesBeforeLongBreak
    ),
  };
}

/**
 * Build a minute-by-minute segment timeline for a focus session of the given
 * total duration, alternating work cycles with short/long breaks.
 * @example
 * buildTimeline(55)
 * // => [WORK 0-25, SHORT_BREAK 25-30, WORK 30-55]
 */
export function buildTimeline(durationMinutes: number): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let cursor = 0;
  let cycle = 0;

  while (cursor < durationMinutes) {
    const workEnd = Math.min(durationMinutes, cursor + POMODORO_DEFAULTS.workMinutes);
    segments.push({
      startMinute: cursor,
      endMinute: workEnd,
      phase: 'WORK',
    });

    if (workEnd >= durationMinutes) break;

    cycle += 1;
    const isLong = cycle % POMODORO_DEFAULTS.cyclesBeforeLongBreak === 0;
    const breakMinutes = isLong
      ? POMODORO_DEFAULTS.longBreak
      : POMODORO_DEFAULTS.shortBreak;
    const breakEnd = Math.min(durationMinutes, workEnd + breakMinutes);

    segments.push({
      startMinute: workEnd,
      endMinute: breakEnd,
      phase: isLong ? 'LONG_BREAK' : 'SHORT_BREAK',
    });

    cursor = breakEnd;
  }

  return segments;
}

export interface PomodoroTimerLike {
  phase: FocusPhase;
  startedAt: Date;
  durationMinutes?: number;
}

/**
 * Check whether the current phase's allocated duration has fully elapsed.
 * @example
 * isCycleComplete({ phase: 'WORK', startedAt: new Date(Date.now() - 26 * 60000) }) // => true
 */
export function isCycleComplete(timer: PomodoroTimerLike, now: Date = new Date()): boolean {
  const durationMinutes = timer.durationMinutes ?? durationForPhase(timer.phase);
  return now.getTime() - timer.startedAt.getTime() >= durationMinutes * 60000;
}

/**
 * Total minutes occupied by a full pomodoro cycle (work + short break).
 */
export function cycleLengthMinutes(
  options: Partial<PomodoroDefaults> = {}
): number {
  const workMinutes = options.workMinutes ?? POMODORO_DEFAULTS.workMinutes;
  const shortBreak = options.shortBreak ?? POMODORO_DEFAULTS.shortBreak;
  return workMinutes + shortBreak;
}