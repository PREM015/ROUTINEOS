import prisma from '@/lib/prisma';
import { scheduleRoutineBlockNotifications, scheduleDailyReminder } from '@/server/notifications/scheduler';
import { scheduleHabitReminders } from '@/server/notifications/habit-reminder';
import { scheduleGoalReminders } from '@/server/notifications/goal-reminder';
import { toUserId } from '@/types/ids';

export interface ScheduleAllResult {
  usersProcessed: number;
  routineNotificationsScheduled: number;
  dailyNotificationsScheduled: number;
  habitReminders: number;
  habitRemindersSkipped: number;
  goalReminders: number;
  goalRemindersSkipped: number;
  errors: string[];
}

/**
 * Run every notification producer once.
 *
 * ## Why this was extracted
 *
 * The producer loop lived inside
 * `GET /api/cron/schedule-routine-notifications`. Adding the per-habit and
 * per-goal producers there meant the tick logic existed in two shapes, and a
 * single consolidated scheduler endpoint would have had to copy it.
 *
 * Extracting it here means one implementation, called from two places:
 * the original route (unchanged behaviour) and the consolidated tick.
 *
 * ## Reliability properties
 *
 * * **Never throws.** Every producer is isolated, so one failing producer cannot
 *   stop the others or lose the tick. Failures are collected in `errors`.
 * * **Idempotent.** Every producer keys its duplicate check on
 *   `(userId, type, relatedEntityId)`, and the per-day id components mean one
 *   row per habit/goal/day no matter how often this runs.
 * * **Settings-aware.** The user queries pre-filter, and each producer
 *   re-checks the relevant `UserSettings` column before writing.
 */
export async function scheduleAllReminders(now: Date = new Date()): Promise<ScheduleAllResult> {
  const errors: string[] = [];

  /**
   * Only users who want push notifications *and* have routine-block
   * notifications switched on. `scheduleRoutineBlockNotifications` re-checks
   * these per user, so this is an optimisation to avoid iterating users that
   * could never be notified anyway.
   */
  const routineUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      settings: {
        pushNotifications: true,
        notificationsEnabled: { not: false },
        routineStartNotifications: { not: false },
      },
    },
    select: { id: true },
  });

  /**
   * The daily reminder has its own filter: it is a habit nudge, not a routine
   * one, so it keys off `dailyReminder` / `habitReminders`.
   */
  const dailyUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      settings: {
        dailyReminder: true,
        habitReminders: { not: false },
        notificationsEnabled: { not: false },
      },
    },
    select: { id: true },
  });

  let routineNotificationsScheduled = 0;
  let dailyNotificationsScheduled = 0;

  for (const user of routineUsers) {
    try {
      routineNotificationsScheduled += await scheduleRoutineBlockNotifications(toUserId(user.id));
    } catch (error) {
      errors.push(
        `User ${user.id} (routine): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  for (const user of dailyUsers) {
    try {
      dailyNotificationsScheduled += await scheduleDailyReminder(toUserId(user.id));
    } catch (error) {
      errors.push(
        `User ${user.id} (daily): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Per-habit and per-goal reminders are self-scoping: each query filters on
  // `reminderEnabled` / `status: ACTIVE` and checks that user's own switches, so
  // there is no point iterating users that cannot match.
  let habitReminders = 0;
  let habitRemindersSkipped = 0;
  let goalReminders = 0;
  let goalRemindersSkipped = 0;

  try {
    const result = await scheduleHabitReminders(now);
    habitReminders = result.created;
    habitRemindersSkipped = result.skippedBySettings;
  } catch (error) {
    errors.push(
      `habit reminders: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  try {
    const result = await scheduleGoalReminders(now);
    goalReminders = result.created;
    goalRemindersSkipped = result.skippedBySettings;
  } catch (error) {
    errors.push(
      `goal reminders: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return {
    usersProcessed: routineUsers.length + dailyUsers.length,
    routineNotificationsScheduled,
    dailyNotificationsScheduled,
    habitReminders,
    habitRemindersSkipped,
    goalReminders,
    goalRemindersSkipped,
    errors,
  };
}
