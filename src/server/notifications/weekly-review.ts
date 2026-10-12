import prisma from '@/lib/prisma';
import { NotificationType } from '@/generated/prisma';
import { fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TZ, getTodayString, getWeekRange, shiftCalendarDay } from '@/lib/dates';
import { resolveWeekStartsOn } from '@/lib/period-range';
import { scheduleNotification } from './scheduler';
import { toUserId } from '@/types/ids';

export function buildWeeklyReviewReminder(weekStart: string): { title: string; body: string } {
  return {
    title: 'Weekly Review Time',
    body: `It's time to review your week starting ${weekStart}.`,
  };
}

/**
 * When (as a local wall-clock) the weekly-review reminder should fire.
 *
 * Kept from the original module so the schedule is stable: the last day of the
 * user's week at 20:00. Two caveats were fixed when the producer was wired up:
 *
 *  - the original used `new Date()` + `getDay()` + `setHours()`, which are
 *    server-local, so the reminder drifted for anyone not running in the
 *    server's zone;
 *  - the caller now only schedules the *next* pending window, so a week whose
 *    end has already passed is never queued as an instantly-due reminder.
 */
export function getWeeklyReviewScheduleTime(preferredDay: string = 'Sunday', preferredTime: string = '17:00'): Date {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayIndex = days.indexOf(preferredDay) !== -1 ? days.indexOf(preferredDay) : 0;
  const now = new Date();
  const currentDay = now.getDay();
  let diff = dayIndex - currentDay;
  if (diff < 0) diff += 7;
  const scheduledDate = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
  const [hh, mm] = preferredTime.split(':').map(Number);
  scheduledDate.setHours(hh || 17, mm || 0, 0, 0);
  return scheduledDate;
}

export interface WeeklyReviewScheduleResult {
  created: number;
  usersSkipped: number;
}

/**
 * Queue one "Weekly review" reminder per user, per week.
 *
 * Reminds users who switched on `weeklyReviewReminder` on the last day of their
 * week (their own `weekStartsOn`) at 20:00 local time — the same 20:00 default
 * the daily reminder uses. Idempotent: one row per `week:<ending date>`, with
 * no status filter, so consecutive ticks can never double-queue a week.
 *
 * @returns the number of rows created and how many eligible users were skipped
 *          only because their reminder was already queued.
 */
export async function scheduleWeeklyReviewReminders(
  now: Date = new Date()
): Promise<WeeklyReviewScheduleResult> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      settings: {
        weeklyReviewReminder: true,
        notificationsEnabled: { not: false },
        pushNotifications: true,
      },
    },
    select: {
      id: true,
      settings: { select: { timezone: true, weekStartsOn: true } },
    },
  });

  let created = 0;

  for (const user of users) {
    const timezone = user.settings?.timezone ?? DEFAULT_TZ;
    const today = getTodayString(timezone);
    const { start, end } = getWeekRange(today, resolveWeekStartsOn(user.settings?.weekStartsOn ?? null));

    // Remind for the week that *ends* at `end`. Once that 20:00 has already
    // passed, the next window is the following week's end — never queue an
    // instantly-due reminder for a week that is already over.
    let targetEnd = end;
    let scheduled = fromZonedTime(`${end}T20:00:00.000`, timezone);
    if (scheduled.getTime() <= now.getTime()) {
      targetEnd = shiftCalendarDay(end, 7);
      scheduled = fromZonedTime(`${targetEnd}T20:00:00.000`, timezone);
    }

    // One row per week, whatever its status later becomes (see the no-status
    // dedupe commentary on `scheduleDailyReminder`).
    const existing = await prisma.notificationLog.count({
      where: {
        userId: user.id,
        type: NotificationType.WEEKLY_REVIEW,
        relatedEntityId: `week:${targetEnd}`,
      },
    });
    if (existing > 0) continue;

    const { title } = buildWeeklyReviewReminder(start);
    await scheduleNotification(toUserId(user.id), NotificationType.WEEKLY_REVIEW, scheduled, {
      title,
      body: `Your week ending ${targetEnd} is ready to review. Catch up on your score trends and set next week's priorities.`,
      actionUrl: '/recap/weekly-review',
      relatedEntityId: `week:${targetEnd}`,
    });
    created += 1;
  }

  return { created, usersSkipped: users.length - created };
}