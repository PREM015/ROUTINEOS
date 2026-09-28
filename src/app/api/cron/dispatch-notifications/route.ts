import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '@/server/services/notification.service';
import { taskReminderService } from '@/server/notifications/task-reminder';
import { authorizeCron } from '@/lib/cron-auth';

/**
 * GET /api/cron/dispatch-notifications
 *
 * Delivers notifications whose `scheduledFor` has passed. The reminder modules
 * only enqueue rows; without this job they stay PENDING indefinitely.
 *
 * Schedule it frequently enough to match reminder granularity — routine blocks
 * use HH:mm start times, so every 5 minutes keeps delivery within 5 minutes.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    // Create the task reminders first, so the dispatch that follows picks them up
    // in the same tick rather than leaving them PENDING until the next one.
    //
    // `TASK_DUE`/`TASK_OVERDUE` had no producer anywhere in the codebase, which
    // is why task reminders "never arrive" even though the settings page promises
    // them. Scheduling here is what makes the promise real. It is idempotent —
    // one reminder per task per kind — so a missed or repeated tick is harmless.
    const taskReminders = await taskReminderService.scheduleTaskReminders();

    const dispatched = await notificationService.dispatchDueNotifications();

    return NextResponse.json({
      success: true,
      data: {
        ...dispatched,
        taskReminders,
      },
    });
  } catch (error) {
    console.error('dispatch notifications cron failed', error);
    return NextResponse.json({ success: false, error: 'Cron job failed' }, { status: 500 });
  }
}
