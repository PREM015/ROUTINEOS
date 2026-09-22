import { POMODORO_DEFAULTS } from './pomodoro';

/**
 * Break scheduling logic for focus sessions.
 * Pure helpers that compute when breaks start and whether a break is due.
 */

export interface BreakPlanOptions {
  /** Minutes of focused work per cycle. */
  workMinutes: number;
  /** Minutes of a short break. */
  shortBreak: number;
  /** Minutes of a long break. */
  longBreak: number;
  /** Number of work cycles before a long break. */
  cyclesBeforeLongBreak: number;
}

/**
 * Plan the start times of all breaks that occur within a focus session of the
 * given duration. A break is never planned at the very end of the session.
 * @example
 * planBreaks(new Date('2026-09-18T09:00:00'), 55)
 * // => [2026-09-18T09:25:00]
 */
export function planBreaks(
  sessionStart: Date,
  durationMinutes: number,
  options: Partial<BreakPlanOptions> = {}
): Date[] {
  if (!(sessionStart instanceof Date) || Number.isNaN(sessionStart.getTime())) {
    throw new TypeError('sessionStart must be a valid Date');
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new TypeError('durationMinutes must be a positive number');
  }

  const workMinutes = options.workMinutes ?? POMODORO_DEFAULTS.workMinutes;
  const shortBreak = options.shortBreak ?? POMODORO_DEFAULTS.shortBreak;
  const longBreak = options.longBreak ?? POMODORO_DEFAULTS.longBreak;
  const cyclesBeforeLongBreak =
    options.cyclesBeforeLongBreak ?? POMODORO_DEFAULTS.cyclesBeforeLongBreak;

  const breaks: Date[] = [];
  let cursorMinutes = 0;
  let cycle = 0;
  const startMs = sessionStart.getTime();

  while (cursorMinutes + workMinutes < durationMinutes) {
    const breakStartMs = startMs + (cursorMinutes + workMinutes) * 60000;
    breaks.push(new Date(breakStartMs));

    cycle += 1;
    const breakMinutes =
      cycle % cyclesBeforeLongBreak === 0 ? longBreak : shortBreak;
    cursorMinutes += workMinutes + breakMinutes;
  }

  return breaks;
}

/**
 * The next planned break that has not yet started, or `null` when the session
 * has no upcoming break scheduled. A break currently in progress is reported
 * as upcoming so the consumer can switch phases.
 */
export function nextBreakAt(
  sessionStart: Date,
  durationMinutes: number,
  now: Date = new Date(),
  options: Partial<BreakPlanOptions> = {}
): Date | null {
  const breaks = planBreaks(sessionStart, durationMinutes, options);
  for (const breakStart of breaks) {
    if (breakStart.getTime() >= now.getTime()) return breakStart;
  }
  return null;
}

/**
 * Whether a planned break has started and passed its grace window, meaning the
 * user should stop working and take the break.
 */
export function breakOverdue(
  plannedStart: Date,
  now: Date = new Date(),
  graceMinutes: number = 5
): boolean {
  if (!(plannedStart instanceof Date) || Number.isNaN(plannedStart.getTime())) {
    throw new TypeError('plannedStart must be a valid Date');
  }
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) {
    throw new TypeError('graceMinutes must be a non-negative number');
  }
  return now.getTime() >= plannedStart.getTime() + graceMinutes * 60000;
}

/**
 * Whether the user should be notified that a break is about to start: the
 * planned start is within `leadMinutes` ahead of `now` and has not yet passed.
 */
export function shouldNotifyBreak(
  plannedStart: Date,
  now: Date = new Date(),
  leadMinutes: number = 1
): boolean {
  if (!(plannedStart instanceof Date) || Number.isNaN(plannedStart.getTime())) {
    throw new TypeError('plannedStart must be a valid Date');
  }
  if (!Number.isFinite(leadMinutes) || leadMinutes < 0) {
    throw new TypeError('leadMinutes must be a non-negative number');
  }
  const leadMs = leadMinutes * 60000;
  return (
    now.getTime() >= plannedStart.getTime() - leadMs &&
    now.getTime() < plannedStart.getTime()
  );
}