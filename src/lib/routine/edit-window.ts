import { calendarDaysBetween } from '@/lib/dates';

/**
 * The retroactive-edit window, as one pure rule.
 *
 * `UserSettings.retroactiveEditDays` has existed in the schema (default `3`) and
 * had exactly two consumers: the Settings page that writes it, and nothing
 * else. No server code read it, so the setting was a promise the app never
 * kept — a user who set it to `0` could still rewrite last month's routine logs.
 *
 * Pure string arithmetic on `YYYY-MM-DD` labels, so it is unit-testable with no
 * database and no clock. See {@link assertWithinEditWindow} for the enforcement
 * side.
 */

/** The value Prisma defaults to when the column has never been set. */
export const DEFAULT_RETROACTIVE_EDIT_DAYS = 3;

/** Clamp a stored (nullable, unvalidated) setting into a usable number. */
export function resolveRetroactiveEditDays(
  stored: number | null | undefined
): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) {
    return DEFAULT_RETROACTIVE_EDIT_DAYS;
  }
  return Math.min(30, Math.max(0, Math.trunc(stored)));
}

export interface EditWindowDecision {
  allowed: boolean;
  /** Days between the target date and today. Negative for a future date. */
  daysAgo: number;
  retroactiveEditDays: number;
  /** User-facing sentence naming the boundary that was crossed. */
  reason: string;
}

/**
 * May a log be written for `date`?
 *
 * Today and future dates are always writable: planning ahead is the point of a
 * routine, and a future date is not a *retroactive* edit at all. Only a past
 * date is measured against the window, and `daysAgo === retroactiveEditDays`
 * is inside it — a window of `3` means today plus the three preceding days.
 */
export function evaluateEditWindow(
  date: string,
  today: string,
  retroactiveEditDays: number
): EditWindowDecision {
  const daysAgo = calendarDaysBetween(date, today);
  const allowed = daysAgo <= retroactiveEditDays;

  return {
    allowed,
    daysAgo,
    retroactiveEditDays,
    reason: allowed
      ? ''
      : retroactiveEditDays === 0
        ? `Routine entries for ${date} can no longer be edited. Your retroactive edit window is off.`
        : `Routine entries for ${date} can no longer be edited. Your window covers the last ${retroactiveEditDays} day${retroactiveEditDays === 1 ? '' : 's'}.`,
  };
}

/**
 * Throw the user-facing error when `date` is outside the window.
 *
 * Kept separate from the pure decision so the service's call site reads as
 * "check, then write" and the rule itself stays testable.
 */
export function assertWithinEditWindow(
  date: string,
  today: string,
  retroactiveEditDays: number
): void {
  const decision = evaluateEditWindow(date, today, retroactiveEditDays);
  if (!decision.allowed) {
    throw new EditWindowError(
      decision.reason,
      decision.daysAgo,
      decision.retroactiveEditDays
    );
  }
}

/**
 * Thrown when a write is outside the user's retroactive window.
 *
 * Its own class rather than a bare `ValidationError` so the route can answer
 * `403` for "your window closed" and `400` for genuinely malformed input. The
 * distinction matters: retrying with different data cannot fix a closed window,
 * so telling the client to fix the payload would be a lie.
 */
export class EditWindowError extends Error {
  readonly daysAgo: number;
  readonly retroactiveEditDays: number;

  constructor(message: string, daysAgo: number, retroactiveEditDays: number) {
    super(message);
    this.name = 'EditWindowError';
    this.daysAgo = daysAgo;
    this.retroactiveEditDays = retroactiveEditDays;
  }
}