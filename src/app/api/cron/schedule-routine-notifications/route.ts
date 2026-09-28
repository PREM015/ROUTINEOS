import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { scheduleAllReminders } from '@/server/notifications/schedule-all';

/**
 * GET /api/cron/schedule-routine-notifications
 * Cron job that queues reminder rows for all eligible users:
 *   - routine block start / advance notices
 *   - the daily habit-logging reminder (`dailyReminder` + `dailyReminderTime`)
 *   - per-habit reminders (`Habit.reminderEnabled` + `reminderTime`)
 *   - per-goal deadline reminders (`Goal.endDate` + `status`)
 *
 * The orchestration now lives in `scheduleAllReminders()` so this route and the
 * consolidated `notification-tick` route share one implementation. Behaviour is
 * unchanged.
 *
 * Prefer `/api/cron/notification-tick` — it also dispatches, so a reminder
 * created here is sent in the same pass.
 *
 * Guarded by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await scheduleAllReminders();

    return NextResponse.json({
      success: true,
      data: {
        usersProcessed: result.usersProcessed,
        routineNotificationsScheduled: result.routineNotificationsScheduled,
        dailyNotificationsScheduled: result.dailyNotificationsScheduled,
        habitReminders: result.habitReminders,
        habitRemindersSkipped: result.habitRemindersSkipped,
        goalReminders: result.goalReminders,
        goalRemindersSkipped: result.goalRemindersSkipped,
        errors: result.errors.length > 0 ? result.errors : undefined,
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
