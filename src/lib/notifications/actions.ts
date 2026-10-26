/**
 * Every action a notification's buttons can carry.
 *
 * Two things have to agree on this list: the scheduler that **offers** the
 * buttons and the API endpoint that **accepts** them. They had already drifted —
 * the routine scheduler pushed `STARTED`, `NOT_YET`, `COMPLETED`, `PARTIAL`,
 * `NOT_DONE` and `EXTEND`, while `/api/notifications/action`'s zod enum knew
 * none of them, so tapping any of those on a push came back 400. Had they
 * reached the service instead they would have fallen through to the snooze
 * branch and thrown "Notification is no longer pending".
 *
 * One exported list, imported by both, is what stops that class of bug
 * recurring: adding a button now means adding its action here first, and the
 * compiler points at whichever side is missing it.
 *
 * Client-safe — no Prisma, no `@/server/*`, nothing the browser cannot import.
 */
import { formatInTimeZone } from 'date-fns-tz';

export const NOTIFICATION_ACTIONS = [
  'DONE',
  'SNOOZE',
  'SKIP',
  'STARTED',
  'NOT_YET',
  'STARTED_ON_TIME',
  'STARTED_LATE',
  'STARTED_EARLY',
  'BUSY_WITH_OTHER',
  'SKIP_BLOCK',
  'COMPLETED',
  'PARTIAL',
  'NOT_DONE',
  'EXTEND',
  'FINISHED_ON_TIME',
  'FINISHED_LATE',
  'FINISHED_EARLY',
  'NOT_COMPLETED',
] as const;

export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

/**
 * Actions that answer a routine check-in, i.e. that write a `RoutineLog`.
 *
 * `STARTED`/`COMPLETED`/… are the phases of the block reminder itself rather
 * than the 20-minute check-in, but they answer the same question about the same
 * block, so they take the same code path.
 */
export const ROUTINE_LOG_ACTIONS = new Set<NotificationAction>([
  'STARTED',
  'STARTED_ON_TIME',
  'STARTED_LATE',
  'STARTED_EARLY',
  'BUSY_WITH_OTHER',
  'SKIP_BLOCK',
  'COMPLETED',
  'PARTIAL',
  'NOT_DONE',
  'FINISHED_ON_TIME',
  'FINISHED_LATE',
  'FINISHED_EARLY',
  'NOT_COMPLETED',
]);

/**
 * Actions that push the notification later instead of answering it.
 *
 * Both mean "not now": `NOT_YET` is asked at block start and `EXTEND` at block
 * end. Neither touches the routine log — the block is still running, so there is
 * nothing to record yet.
 */
export const SNOOZE_ACTIONS = new Set<NotificationAction>(['SNOOZE', 'NOT_YET', 'EXTEND']);

/**
 * Is this action about the **start** half of a block, as opposed to its end?
 *
 * Kept here — not in the service — because both the service that writes the log
 * and the pure time-derivation below have to agree on it, and a second copy that
 * drifts would stamp a start time into `actualEndTime`.
 */
export function isStartPhaseAction(action: NotificationAction): boolean {
  return (
    action === 'STARTED' ||
    action.startsWith('STARTED_') ||
    action === 'BUSY_WITH_OTHER' ||
    action === 'SKIP_BLOCK'
  );
}

/** Is this action about the **end** of a block (a completion answer)? */
export function isCompletionPhaseAction(action: NotificationAction): boolean {
  return (
    action.startsWith('FINISHED_') ||
    action === 'NOT_COMPLETED' ||
    action === 'COMPLETED' ||
    action === 'PARTIAL' ||
    action === 'NOT_DONE'
  );
}

export interface DerivedActualTimes {
  /** `HH:mm` in the user's timezone, or absent when the action records no start. */
  actualStartTime?: string;
  /** `HH:mm` in the user's timezone, or absent when the action records no end. */
  actualEndTime?: string;
  /**
   * The absolute instant the answer happened, verbatim. This is the full
   * precision value — `actualStartTime`/`actualEndTime` are its `HH:mm` rendering
   * for display and for the duration maths, and are lossy by design.
   */
  answeredAt: Date;
}

/**
 * Turn "the user pressed a button at instant X" into the wall-clock times a
 * `RoutineLog` stores.
 *
 * ## Why derivation lives here, and why it is pure
 *
 * The notification carried `scheduledFor` and the block's times, but nothing
 * recorded *when the answer actually happened* — a 06:00 reminder answered at
 * 06:12 recorded no time at all, and one answered at 00:30 the next day could
 * not be told apart from one answered on time. The fix is to stamp the instant
 * on the client and **derive** the displayed `HH:mm` from it, in the user's own
 * timezone, on the server. The client's wall-clock string is never trusted,
 * because it can be wrong, missing, or from a device in another zone.
 *
 * Pure: takes the action, the answered-at instant, the timezone and the block's
 * scheduled times, and returns the fields to write. No clock read, no DB, so the
 * cross-midnight cases below are unit-testable.
 *
 * ## Which half of the block does the time belong to?
 *
 *  - a **start** action stamps `actualStartTime`;
 *  - a **completion** action stamps `actualEndTime`, and also seeds
 *    `actualStartTime` **only when the log has no start yet** (an answer like
 *    "finished late" with no recorded start still wants a start to measure from).
 *  - a `SKIP_BLOCK` / `NOT_DONE` answer records a status but no time — there was
 *    no work to time.
 *
 * @param action      The button the user pressed.
 * @param answeredAt  The instant of the press, as an ISO string or `Date`.
 * @param timezone    IANA zone the `HH:mm` should be rendered in (the user's).
 * @param existingStart  The log's current `actualStartTime`, so a completion
 *                       does not overwrite a better start with a repeat.
 */
export function deriveActualTimes(
  action: NotificationAction,
  answeredAt: string | Date,
  timezone: string,
  existingStart: string | null,
): DerivedActualTimes {
  const instant = typeof answeredAt === 'string' ? new Date(answeredAt) : answeredAt;
  // An unparseable instant is not a reason to invent a time; carry the instant
  // through (so `answeredAt` is still recorded) but claim no wall-clock time.
  const clock = Number.isNaN(instant.getTime())
    ? null
    : formatInTimeZone(instant, timezone, 'HH:mm');

  if (clock === null) {
    return { answeredAt: instant };
  }

  if (action === 'SKIP_BLOCK' || action === 'NOT_COMPLETED' || action === 'NOT_DONE') {
    // Status-only answers: a real "no" with no timed work behind it.
    return { answeredAt: instant };
  }

  if (isStartPhaseAction(action)) {
    return { actualStartTime: clock, answeredAt: instant };
  }

  if (isCompletionPhaseAction(action)) {
    // Only fill a start we do not already have — a recorded start is better
    // information than the moment the completion button happened to be pressed.
    const needsStart = existingStart === null || existingStart === undefined;
    return {
      ...(needsStart ? { actualStartTime: clock } : {}),
      actualEndTime: clock,
      answeredAt: instant,
    };
  }

  return { answeredAt: instant };
}
