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
