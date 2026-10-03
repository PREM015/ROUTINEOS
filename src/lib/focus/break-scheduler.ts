/**
 * Break scheduling — when the next break falls inside a running focus session.
 *
 * Reinstated because `FocusService.listBreaks` uses it to compute the
 * `nextScheduledBreak` hint that `GET /api/breaks` returns. That route is dead in
 * the client (nothing calls it) but it is the breaks domain's API surface and is
 * not this page's to delete.
 *
 * The four-duration shape is hard-coded to the Pomodoro defaults rather than read
 * from settings, because the only caller passes a *planned* session length and has
 * no settings to hand. If the hint is ever shown in the UI it must first be
 * re-derived from the user's configured durations — a hint computed from defaults
 * would silently contradict the timer the user is actually looking at.
 */

/** Minutes of focused work per cycle. */
const WORK_MINUTES = 25;
/** Minutes of a short break. */
const SHORT_BREAK = 5;
/** Minutes of a long break. */
const LONG_BREAK = 15;
/** Work cycles before a long break. */
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
export function nextBreakAt(sessionStart: Date, durationMinutes: number): Date | null {
  return planBreaks(sessionStart, durationMinutes)[0] ?? null;
}
