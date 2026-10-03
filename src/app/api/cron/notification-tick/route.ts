import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { scheduleAllReminders } from '@/server/notifications/schedule-all';
import { taskReminderService } from '@/server/notifications/task-reminder';
import { notificationService } from '@/server/services/notification.service';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { dayTypePlanningService } from '@/server/services/day-type-planning.service';
import { UserRepository } from '@/server/repositories/user.repository';
import { toUserId } from '@/types/ids';

/**
 * GET /api/cron/notification-tick
 *
 * The single production scheduler endpoint: one HTTP call processes
 * **everything** currently due, in one pass.
 *
 * ## Why one endpoint
 *
 * The GitHub Actions workflow used to make three separate calls (sleep, schedule,
 * dispatch) every five minutes. Folding them into one route means:
 *
 *   * one runner, one invocation, one set of auth checks per tick;
 *   * a reminder created by the producers is dispatched in the *same* tick
 *     instead of waiting another interval;
 *   * the scheduler cannot half-succeed between steps.
 *
 * It **composes** the existing services rather than replacing them, so
 * `sleep-notifications`, `schedule-routine-notifications` and
 * `dispatch-notifications` all still work unchanged if anything calls them
 * directly.
 *
 * ## Order
 *
 *   1. Sleep prompts. `SLEEP_PROMPT` is excluded from the generic dispatcher and
 *      is pushed directly by `ensureSleepPrompt`, so it must run before (or
 *      independently of) the generic dispatch.
 *   2. Producers — routine blocks, daily nudge, per-habit, per-goal, tasks.
 *   3. Dispatch everything now due.
 *
 * ## Reliability
 *
 * Every stage is independently try/caught. A failure in one is reported in
 * `errors` and does not stop the rest, because a partial tick that still clears
 * the dispatch backlog is far better than an aborted one.
 *
 * The dispatcher itself selects `PENDING AND scheduledFor <= now`, so this is
 * safe to run as often as you like and safe to run late: a missed tick causes a
 * *late* notification, never a lost one.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const errors: string[] = [];
  const stages: Record<string, unknown> = {};

  // 1. Sleep prompts (creates the bedtime prompt and pushes it).
  try {
    stages.sleep = await sleepSessionService.processSleepNotifications();
  } catch (error) {
    errors.push(`sleep: ${message(error)}`);
  }

  // 2. Producers.
  try {
    stages.scheduled = await scheduleAllReminders();
  } catch (error) {
    errors.push(`schedule: ${message(error)}`);
  }

  // 2b. Task due/overdue reminders. `dispatchDueNotifications` also invoked this,
  // but doing it here keeps the tick's creation stage complete on its own.
  try {
    stages.taskReminders = await taskReminderService.scheduleTaskReminders();
  } catch (error) {
    errors.push(`task reminders: ${message(error)}`);
  }

  // 3. Dispatch everything due.
  try {
    stages.dispatched = await notificationService.dispatchDueNotifications();
  } catch (error) {
    errors.push(`dispatch: ${message(error)}`);
  }

  // 4. Apply fallback DayType for tomorrow if needed (runs at midnight).
  // This ensures all users have tomorrow's routine ready even if they didn't select.
  try {
    const userRepo = new UserRepository();
    const activeUsers = await userRepo.findActiveUserIds();
    let fallbacksApplied = 0;
    
    for (const userId of activeUsers) {
      try {
        const result = await dayTypePlanningService.applyFallbackIfNeeded(toUserId(userId));
        if (result) fallbacksApplied++;
      } catch (err) {
        errors.push(`fallback for user ${userId}: ${message(err)}`);
      }
    }
    stages.fallbacksApplied = fallbacksApplied;
  } catch (error) {
    errors.push(`fallback: ${message(error)}`);
  }

  return NextResponse.json({
    success: errors.length === 0,
    data: {
      durationMs: Date.now() - startedAt,
      ...stages,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
