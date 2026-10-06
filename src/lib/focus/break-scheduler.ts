/**
 * Break scheduling — when the next break falls inside a running focus session.
 *
 * Reinstated because `FocusService.listBreaks` uses it to compute the
 * `nextScheduledBreak` hint that `GET /api/breaks` returns.
 *
 * ## Why the constants below are only a last-resort default
 *
 * They mirror the `FocusSettings` column defaults so a caller with no settings still
 * gets a usable answer. They are **not** the answer for a user who configured a 50-
 * minute block: a hint computed from defaults would contradict the timer they are
 * looking at. `FocusService.listBreaks` therefore reads the real durations and passes
 * them through `options` - the `??` fallbacks here only fire when nothing is supplied.
 *
 * Single-sourced from `durations.ts` rather than re-typed, so there is one definition
 * of the default rather than three that can drift.
 */
import { DEFAULT_FOCUS_DURATIONS } from './durations';

/** Minutes of focused work per cycle. */
const WORK_MINUTES = DEFAULT_FOCUS_DURATIONS.focusMinutes;
/** Minutes of a short break. */
const SHORT_BREAK = DEFAULT_FOCUS_DURATIONS.shortBreakMinutes;
/** Minutes of a long break. */
const LONG_BREAK = DEFAULT_FOCUS_DURATIONS.longBreakMinutes;
/**
 * Work cycles before a long break.
 *
 * Not in `DEFAULT_FOCUS_DURATIONS` because it is a count rather than a duration, so it
 * has no business in a durations module. Mirrors `FocusSettings.cyclesBeforeLongBreak`.
 */
const CYCLES_BEFORE_LONG_BREAK = 4;

export interface BreakPlanOptions {
  workMinutes: number;
  shortBreak: number;
  longBreak: number;
  cyclesBeforeLongBreak: number;
}

/**
 * Plan the start times of all breaks that occur within a session of the given
 * duration. A break is never planned at the very end of the session.
 * @example
 * planBreaks(new Date('2026-09-18T09:00:00'), 55)
 * // => [2026-09-18T09:25:00]
 */
export function planBreaks(
  sessionStart: Date,
  durationMinutes: number,
  options: Partial<BreakPlanOptions> = {}
): Date[] {
  const workMinutes = options.workMinutes ?? WORK_MINUTES;
  const shortBreak = options.shortBreak ?? SHORT_BREAK;
  const longBreak = options.longBreak ?? LONG_BREAK;
  const cyclesBeforeLongBreak = options.cyclesBeforeLongBreak ?? CYCLES_BEFORE_LONG_BREAK;

  const breaks: Date[] = [];
  let cursor = 0;
  let cycle = 0;

  // Bounded so a nonsense duration cannot spin here. 400 cycles is about 200 hours,
  // far beyond any real timebox.
  for (let guard = 0; guard < 400 && cursor < durationMinutes; guard += 1) {
    cursor += workMinutes;
    if (cursor >= durationMinutes) break;
    cycle += 1;
    breaks.push(new Date(sessionStart.getTime() + cursor * 60_000));
    cursor += cycle % cyclesBeforeLongBreak === 0 ? longBreak : shortBreak;
  }

  return breaks;
}

/**
 * The next break due inside a session, or `null` if the session ends first.
 * @example
 * nextBreakAt(new Date('2026-09-18T09:00:00'), 55) // => 2026-09-18T09:25:00
 */
export function nextBreakAt(
  sessionStart: Date,
  durationMinutes: number,
  options: Partial<BreakPlanOptions> = {}
): Date | null {
  return planBreaks(sessionStart, durationMinutes, options)[0] ?? null;
}
