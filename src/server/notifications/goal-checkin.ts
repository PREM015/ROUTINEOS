import { NotificationStatus, NotificationType } from '@/generated/prisma';
import prisma from '@/lib/prisma';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { calendarDaysBetween, toLocalDateString } from './goal-reminder';

/**
 * Goal check-in reminder producer.
 *
 * This schedules periodic check-in reminders for active goals, asking the user
 * about their progress. It complements the deadline-based GOAL_DEADLINE notifications.
 */

export interface GoalCheckinResult {
  created: number;
  considered: number;
  skippedBySettings: number;
}

export async function scheduleGoalCheckins(
  now: Date = new Date()
): Promise<GoalCheckinResult> {
  const result: GoalCheckinResult = { created: 0, considered: 0, skippedBySettings: 0 };

  const goals = await prisma.goal.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      endDate: true,
      userId: true,
      user: {
        select: {
          settings: {
            select: {
              timezone: true,
              notificationsEnabled: true,
              goalReminders: true,
            },
          },
        },
      },
    },
  });

  result.considered = goals.length;

  for (const goal of goals) {
    const settings = goal.user.settings;
    if (settings?.notificationsEnabled === false || settings?.goalReminders === false) {
      result.skippedBySettings += 1;
      continue;
    }

    const timezone = settings?.timezone ?? DEFAULT_TZ;
    const todayLocal = getTodayString(timezone);

    const endLocal = toLocalDateString(goal.endDate, timezone);
    const daysRemaining = calendarDaysBetween(todayLocal, endLocal);

    // Only schedule check-ins for goals that are not imminent (not in deadline window)
    // and not too far in the future
    if (daysRemaining <= 3) continue; // Handled by GOAL_DEADLINE
    if (daysRemaining > 30) continue; // Too far out

    // For simplicity, schedule check-in every N days from now
    // In a real implementation, we'd track last check-in date
    const relatedEntityId = `goal-checkin:${goal.id}:${todayLocal}`;

    const existing = await prisma.notificationLog.count({
      where: { userId: goal.userId, type: NotificationType.GOAL_CHECKIN, relatedEntityId },
    });
    if (existing > 0) continue;

    await prisma.notificationLog.create({
      data: {
        userId: goal.userId,
        type: NotificationType.GOAL_CHECKIN,
        title: `Progress check: ${goal.title}`,
        body: `How is your progress on "${goal.title}"? ${daysRemaining} days remaining.`,
        actionUrl: `/goals?goal=${goal.id}`,
        relatedEntityId,
        scheduledFor: now,
        status: NotificationStatus.PENDING,
      },
    });

    result.created += 1;
  }

  return result;
}