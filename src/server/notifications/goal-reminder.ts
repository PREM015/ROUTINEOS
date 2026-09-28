import { NotificationStatus, NotificationType } from '@/generated/prisma';
import prisma from '@/lib/prisma';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';

/**
 * Goal deadline reminder producer.
 *
 * ## Why this was rewritten
 *
 * The previous version was never imported and was not usable:
 *
 *   * `daysRemaining: 5` was hardcoded for every goal, so every goal claimed
 *     the same fake deadline countdown.
 *   * `isOverdue: false` was hardcoded, so an overdue goal could never be
 *     reported as overdue.
 *   * It filtered on `completed: false`, but `Goal` has **no** `completed`
 *     column â€” it has `status: GoalStatus`. The query would have thrown.
 *   * `(db as any)` throughout, plus `|| []` swallowing database errors.
 *
 * ## What replaced it
 *
 * The real deadline already exists: `Goal.endDate` is a required `DateTime`, and
 * `Goal.status` distinguishes `ACTIVE` from completed/cancelled goals. So again
 * **no migration was needed** â€” only correct arithmetic.
 *
 * `daysRemaining` and `isOverdue` are now computed from the user's own calendar
 * day in their own timezone, not from a constant.
 */

/** How close a deadline must be before the user is nudged about it. */
export const GOAL_DUE_SOON_DAYS = 3;

export interface GoalReminderResult {
  created: number;
  considered: number;
  skippedBySettings: number;
}

export interface GoalDeadlineInfo {
  goalId: string;
  title: string;
  daysRemaining: number;
  isOverdue: boolean;
}

/**
 * Whole calendar days from `todayLocal` to `endLocal`, in the user's own zone.
 *
 * Both arguments are already `YYYY-MM-DD` strings local to the user, so this is
 * pure calendar arithmetic with no timezone and no DST involvement â€” which is
 * what "3 days left" should mean. A goal due at 23:00 tonight is 0 days left
 * today, not "in 4 hours".
 */
export function calendarDaysBetween(fromLocal: string, toLocal: string): number {
  const from = Date.UTC(
    Number(fromLocal.slice(0, 4)),
    Number(fromLocal.slice(5, 7)) - 1,
    Number(fromLocal.slice(8, 10))
  );
  const to = Date.UTC(
    Number(toLocal.slice(0, 4)),
    Number(toLocal.slice(5, 7)) - 1,
    Number(toLocal.slice(8, 10))
  );
  return Math.round((to - from) / 86_400_000);
}

/** The `YYYY-MM-DD` that `instant` falls on in `timezone`. */
function toLocalDateString(instant: Date, timezone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    // An invalid IANA zone in the user's settings must not abort the run.
    return getTodayString(DEFAULT_TZ);
  }
}

/**
 * Queue one reminder per active goal that is close to, or past, its deadline.
 *
 * @param now Injectable for testing.
 */
export async function scheduleGoalReminders(
  now: Date = new Date()
): Promise<GoalReminderResult> {
  const result: GoalReminderResult = { created: 0, considered: 0, skippedBySettings: 0 };

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

    // Only nudge inside the window. A goal 30 days out is not news.
    if (daysRemaining > GOAL_DUE_SOON_DAYS) continue;
    if (daysRemaining < -GOAL_DUE_SOON_DAYS) continue;

    const isOverdue = daysRemaining < 0;
    // One reminder per goal per day, so a goal due tomorrow nudges once today
    // rather than once per scheduler tick.
    const relatedEntityId = `goal:${goal.id}:${todayLocal}`;

    const existing = await prisma.notificationLog.count({
      where: { userId: goal.userId, type: NotificationType.GOAL_DEADLINE, relatedEntityId },
    });
    if (existing > 0) continue;

    const body = isOverdue
      ? `Your goal "${goal.title}" was due ${Math.abs(daysRemaining)} day${
          Math.abs(daysRemaining) === 1 ? '' : 's'
        } ago.`
      : daysRemaining === 0
        ? `Your goal "${goal.title}" is due today.`
        : `Your goal "${goal.title}" is due in ${daysRemaining} day${
            daysRemaining === 1 ? '' : 's'
          }.`;

    await prisma.notificationLog.create({
      data: {
        userId: goal.userId,
        type: NotificationType.GOAL_DEADLINE,
        title: isOverdue ? 'Goal overdue' : 'Goal deadline approaching',
        body,
        actionUrl: '/goals',
        relatedEntityId,
        // Due immediately: it is already inside the window, and `now` is what
        // the dispatcher compares `scheduledFor` against.
        scheduledFor: now,
        status: NotificationStatus.PENDING,
      },
    });

    result.created += 1;
  }

  return result;
}

