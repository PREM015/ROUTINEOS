import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import {
  scheduleRoutineBlockNotifications,
  scheduleDailyReminder,
} from '@/server/notifications/scheduler';
import prisma from '@/lib/prisma';
import { scheduleHabitReminders } from '@/server/notifications/habit-reminder';
import { scheduleGoalReminders } from '@/server/notifications/goal-reminder';

/**
 * GET /api/cron/schedule-routine-notifications
 * Cron job that queues reminder rows for all eligible users:
 *   - routine block start / advance notices
 *   - the daily habit-logging reminder (`dailyReminder` + `dailyReminderTime`)
 *
 * Runs every ~15 minutes to keep notifications up to date. Both producers are
 * idempotent per day, so repeat runs do not duplicate rows.
 * Guarded by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    // Only users who want push notifications *and* have routine-block
    // notifications switched on. `scheduleRoutineBlockNotifications` re-checks
    // these per user, so this query is an optimisation to avoid iterating
    // users that could never be notified anyway.
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

    // The daily reminder has its own filter: it is a habit nudge, not a
    // routine one, so it keys off `dailyReminder` / `habitReminders`.
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

    let routineScheduled = 0;
    let dailyScheduled = 0;
    const errors: string[] = [];

    for (const user of routineUsers) {
      try {
        routineScheduled += await scheduleRoutineBlockNotifications(user.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`User ${user.id} (routine): ${errorMsg}`);
      }
    }

    for (const user of dailyUsers) {
      try {
        dailyScheduled += await scheduleDailyReminder(user.id);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`User ${user.id} (daily): ${errorMsg}`);
      }
    }

    /**
     * Per-habit and per-goal reminders run last and are self-scoping: each
     * producer queries only the rows that can actually produce a reminder and
     * checks that user's own `notificationsEnabled` / `habitReminders` /
     * `goalReminders` switches before writing anything.
     *
     * A failure in one producer must not stop the other, nor the routine and
     * daily producers above, so each is isolated.
     */
    const habitReminders = { created: 0, skippedBySettings: 0 };
    const goalReminders = { created: 0, skippedBySettings: 0 };

    try {
      Object.assign(habitReminders, await scheduleHabitReminders());
    } catch (error) {
      errors.push(
        `habit reminders: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    try {
      Object.assign(goalReminders, await scheduleGoalReminders());
    } catch (error) {
      errors.push(
        `goal reminders: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        usersProcessed: routineUsers.length + dailyUsers.length,
        routineNotificationsScheduled: routineScheduled,
        dailyNotificationsScheduled: dailyScheduled,
        // Per-habit and per-goal reminders. These are not user-scoped loops
        // because the query itself already filters on `reminderEnabled`,
        // `status: 'ACTIVE'` and the user's notification settings, so there is
        // no point iterating a list of users that cannot match.
        habitReminders: habitReminders.created,
        habitRemindersSkipped: habitReminders.skippedBySettings,
        goalReminders: goalReminders.created,
        goalRemindersSkipped: goalReminders.skippedBySettings,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('schedule-routine-notifications cron failed', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed' },
      { status: 500 }
    );
  }
}