import { fromZonedTime } from 'date-fns-tz';
import { NotificationStatus, NotificationType } from '@/generated/prisma';
import prisma from '@/lib/prisma';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';

/**
 * Per-habit reminder producer.
 *
 * ## Why this was rewritten
 *
 * This module existed but was never imported, and it was not usable as written:
 *
 *   * `scheduledTime: '09:00'` was hardcoded for **every** habit, so it could
 *     only ever have produced a fake 09:00 reminder regardless of what the user
 *     configured.
 *   * `(db as any).habitReminderLog.create(...)` referenced a model that does
 *     not exist in `schema.prisma`, so `markReminderSent` would have thrown.
 *   * `(db as any).habit.findMany(...) || []` swallowed every database error
 *     and turned a failure into "the user has no habits".
 *
 * ## What replaced it
 *
 * The real per-habit reminder data already exists in the schema — `Habit` has
 * `reminderTime String?` and `reminderEnabled Boolean` — so **no migration was
 * needed**. This reads those two columns and schedules a notification at the
 * habit's own time, in the user's own timezone.
 *
 * Duplicate prevention keys on `(userId, type, relatedEntityId)` where
 * `relatedEntityId` is `habit:<id>:<localDate>`, so a habit produces at most one
 * reminder per day no matter how often the scheduler runs.
 */

export interface HabitReminderResult {
  created: number;
  considered: number;
  skippedBySettings: number;
}

/**
 * Queue a reminder for every habit that has `reminderEnabled` set and a
 * `reminderTime` that has already passed today.
 *
 * @param now Injectable for testing.
 */
export async function scheduleHabitReminders(
  now: Date = new Date()
): Promise<HabitReminderResult> {
  const result: HabitReminderResult = { created: 0, considered: 0, skippedBySettings: 0 };

  const candidates = await prisma.habit.findMany({
    where: { status: 'ACTIVE', reminderEnabled: true, reminderTime: { not: null } },
    select: {
      id: true,
      name: true,
      reminderTime: true,
      userId: true,
      user: {
        select: {
          settings: {
            select: {
              timezone: true,
              notificationsEnabled: true,
              habitReminders: true,
            },
          },
        },
      },
    },
  });

  result.considered = candidates.length;

  for (const habit of candidates) {
    const settings = habit.user.settings;

    // A missing settings row means notifications were never configured. The
    // dispatcher treats a missing row as "on" so a brand-new user still gets
    // reminders, so match that here rather than silently dropping them.
    if (settings?.notificationsEnabled === false || settings?.habitReminders === false) {
      result.skippedBySettings += 1;
      continue;
    }

    const timezone = settings?.timezone ?? DEFAULT_TZ;
    const scheduledFor = reminderInstantFor(habit.reminderTime, timezone, now);
    // `null` means the habit's time has not arrived yet today.
    if (!scheduledFor) continue;

    const relatedEntityId = `habit:${habit.id}:${getTodayString(timezone)}`;

    const existing = await prisma.notificationLog.count({
      where: { userId: habit.userId, type: NotificationType.HABIT_REMINDER, relatedEntityId },
    });
    if (existing > 0) continue;

    await prisma.notificationLog.create({
      data: {
        userId: habit.userId,
        type: NotificationType.HABIT_REMINDER,
        title: habit.name,
        body: 'Time for your habit: ' + habit.name,
        actionUrl: '/today',
        relatedEntityId,
        scheduledFor,
        status: NotificationStatus.PENDING,
      },
    });

    result.created += 1;
  }

  return result;
}

/**
 * The absolute instant a habit's `HH:mm` reminder falls on today in the user's
 * timezone, or `null` if that time is still ahead of `now`.
 *
 * ## Why `fromZonedTime` and not `toZonedTime` + `setHours`
 *
 * `scheduler.ts` built its `scheduledFor` with `toZonedTime(new Date(), tz)`
 * followed by `.setHours(h, m, 0, 0)`, then handed that `Date` to Prisma.
 * `toZonedTime` returns a `Date` whose *system-local* fields read as the target
 * zone's wall clock; Prisma persists its absolute instant, which is wrong by the
 * zone's UTC offset. For `Asia/Kolkata` that is a 5h30m error — a 20:00 reminder
 * would be stored 5h30m off and fire at the wrong time.
 *
 * `fromZonedTime` is the correct inverse: it turns a wall-clock time in a named
 * zone into the absolute instant. `src/lib/dates.ts` already uses it, so this
 * matches the rest of the codebase.
 */
function reminderInstantFor(
  reminderTime: string | null,
  timezone: string,
  now: Date
): Date | null {
  if (!reminderTime) return null;

  const match = /^(\d{2}):(\d{2})$/.exec(reminderTime.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  let instant: Date;
  try {
    const localDate = getTodayString(timezone);
    const wallClock =
      localDate +
      'T' +
      String(hours).padStart(2, '0') +
      ':' +
      String(minutes).padStart(2, '0') +
      ':00.000';
    instant = fromZonedTime(wallClock, timezone);
  } catch {
    // An invalid IANA zone in the user's settings must not abort the whole run.
    return null;
  }

  // Only queue once the time has actually arrived, otherwise the dispatcher
  // would deliver it on the first tick of the day instead of at the chosen time.
  return instant.getTime() <= now.getTime() ? instant : null;
}
