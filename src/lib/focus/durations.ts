import type { FocusMode } from './type-backfill';

/**
 * Mirrors the `FocusSettings` duration column defaults.
 *
 * Declared here rather than imported so this module stays a pure leaf with no import
 * from the metrics glossary. The duplication is deliberate and is checked by
 * `tests/lib/focus-durations.test.ts`, which pins these against the Prisma schema -
 * that test is what stops the two drifting.
 */
export const DEFAULT_FOCUS_DURATIONS: FocusDurationSource = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

/**
 * How long each mode runs, in milliseconds, from the user's settings.
 *
 * ## Why this is one function
 *
 * The timebox used to be a literal `25 * 60_000` in the store's initial state and again
 * as the fallback clamp in the runtime's restore path. Two literals for one value, both
 * already stale against the `FocusSettings` columns they were supposed to mirror, and
 * neither reading the user's actual configuration - so the settings that existed in the
 * schema could not change the timer.
 *
 * One function, pure, means the store, the runtime and the settings page cannot
 * disagree about how long a focus block is.
 *
 * ## Stopwatch
 *
 * Deliberately has no length. A stopwatch counts up, so it has no `plannedMs`; the
 * caller keeps whatever it had and the timer renders elapsed time instead. Returning
 * `null` rather than a default makes "no planned length" explicit instead of
 * pretending a stopwatch has a 25-minute goal.
 */

/** The subset of `FocusSettings` this needs. Structural, so tests need no full row. */
export interface FocusDurationSource {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

/**
 * The planned length for a mode, or `null` for a stopwatch.
 *
 * Clamped to a positive value because a zero or negative timebox would make
 * `endsAt <= startedAt`, and the runtime would treat the session as instantly
 * finished - which reads as "your focus session ended before it began".
 */
export function plannedMsFor(
  mode: FocusMode,
  settings: FocusDurationSource = DEFAULT_FOCUS_DURATIONS
): number | null {
  const minutes = minutesFor(mode, settings);
  if (minutes === null) return null;
  return Math.max(1, Math.round(minutes)) * 60_000;
}

/** The same mapping in minutes, for display and for the settings page's labels. */
export function minutesFor(
  mode: FocusMode,
  settings: FocusDurationSource = DEFAULT_FOCUS_DURATIONS
): number | null {
  switch (mode) {
    case 'focus':
      return settings.focusMinutes;
    case 'short-break':
      return settings.shortBreakMinutes;
    case 'long-break':
      return settings.longBreakMinutes;
    case 'stopwatch':
      return null;
  }
}

/**
 * Whether a finished break should hand straight back to focus.
 *
 * `autoStartBreak` and `autoStartFocus` are separate settings because they answer
 * different questions: "should a break begin by itself" and "should work resume by
 * itself". Reading one to imply the other is how a user ends up in an unbroken chain
 * of focus blocks they did not ask for.
 */
export function shouldAutoStartNext(
  finishedMode: FocusMode,
  settings: { autoStartBreak: boolean; autoStartFocus: boolean; cyclesBeforeLongBreak: number },
  completedCycles: number
): FocusMode | null {
  if (finishedMode === 'stopwatch') return null;

  if (finishedMode === 'focus') {
    if (!settings.autoStartBreak) return null;
    // A long break only replaces a short one on the boundary. Using
    // `>= cyclesBeforeLongBreak` means lowering the count takes effect on the next
    // block rather than waiting out the old cycle.
    return completedCycles > 0 && completedCycles % settings.cyclesBeforeLongBreak === 0
      ? 'long-break'
      : 'short-break';
  }

  // A break just ended.
  return settings.autoStartFocus ? 'focus' : null;
}