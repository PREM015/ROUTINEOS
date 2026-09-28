import prisma from '@/lib/prisma';
import { NotificationType } from '@/generated/prisma';
import { addDays, startOfDay, differenceInMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';

/**
 * Notification Scheduler
 * Queue and schedule notifications
 */

export async function scheduleNotification(
  userId: string,
  type: NotificationType,
  scheduledFor: Date,
  data: {
    title: string;
    body: string;
    actionUrl?: string;
    relatedEntityId?: string;
    /** Serialized into the `actionData` JSON column. */
    data?: Record<string, unknown>;
  }
) {
  return await prisma.notificationLog.create({
    data: {
      userId,
      type,
      title: data.title,
      body: data.body,
      actionUrl: data.actionUrl,
      relatedEntityId: data.relatedEntityId,
      actionData: data.data ? JSON.stringify(data.data) : undefined,
      scheduledFor,
      status: 'PENDING',
    },
  });
}

/**
 * Get pending notifications
 */
export async function getPendingNotifications(beforeDate: Date = new Date()) {
  return await prisma.notificationLog.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: beforeDate },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          settings: true,
        },
      },
    },
    take: 100,
  });
}

/**
 * Mark notification as sent
 */
export async function markNotificationSent(
  notificationId: string,
  channels: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  }
) {
  return await prisma.notificationLog.update({
    where: { id: notificationId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      sentViaEmail: channels.email || false,
      sentViaPush: channels.push || false,
      sentViaSMS: channels.sms || false,
    },
  });
}

/**
 * Mark notification as failed
 */
export async function markNotificationFailed(
  notificationId: string,
  errorMessage: string
) {
  return await prisma.notificationLog.update({
    where: { id: notificationId },
    data: {
      status: 'FAILED',
      errorMessage,
      retryCount: { increment: 1 },
    },
  });
}

/**
 * Check if a notification already exists for this routine block
 * to prevent duplicates
 */
async function existsPendingNotification(
  userId: string,
  routineBlockId: string,
  type: NotificationType
): Promise<boolean> {
  const existing = await prisma.notificationLog.count({
    where: {
      userId,
      type,
      relatedEntityId: routineBlockId,
      status: 'PENDING',
    },
  });
  return existing > 0;
}

/**
 * The subset of `UserSettings` the scheduler needs in order to decide whether
 * a notification may be queued at all.
 *
 * Every per-category switch on the Settings > Notifications page used to be
 * stripped by Zod and had no column to land in, so the toggles saved nothing
 * and the scheduler below hardcoded `advanceMinutes = 0`. These columns now
 * exist and are honoured here.
 */
interface NotificationPreferences {
  notificationsEnabled: boolean | null;
  routineStartNotifications: boolean | null;
  upcomingRoutineNotifications: boolean | null;
  sleepReminderNotifications: boolean | null;
  habitReminderNotifications: boolean | null;
  goalReminderNotifications: boolean | null;
  advanceNotificationMinutes: number | null;
  timezone: string | null;
}

/**
 * Get the user's timezone from their settings
 */
async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true },
  });

  // `DEFAULT_TZ` is "UTC", matching the `UserSettings.timezone` column default
  // and `User.timezone`. This hard-coded "Asia/Kolkata" was the one remaining
  // place that disagreed, so a user with no settings row had reminders scheduled
  // in IST while every other subsystem bucketed them in UTC.
  return user?.settings?.timezone ?? DEFAULT_TZ;
}

/**
 * Load the notification preferences that gate routine-block reminders.
 * Returns `null` when the user has no settings row, in which case the caller
 * falls back to the permissive defaults.
 */
async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  return prisma.userSettings.findUnique({
    where: { userId },
    select: {
      notificationsEnabled: true,
      routineStartNotifications: true,
      upcomingRoutineNotifications: true,
      sleepReminderNotifications: true,
      habitReminderNotifications: true,
      goalReminderNotifications: true,
      advanceNotificationMinutes: true,
      timezone: true,
    },
  });
}

/**
 * Calculate the next occurrence of a routine block
 * based on the template's dayType and current time
 */
function getNextOccurrence(
  startTime: string, // "HH:mm"
  isOvernight: boolean,
  dayType: string, // "WORKDAY", "WEEKEND", "HOLIDAY", etc.
  currentDate: Date
): Date | null {
  const [hours, minutes] = startTime.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return null;

  const now = currentDate;

  // Determine if today matches the dayType
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday-Sunday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

  let matchesDayType = false;

  switch (dayType) {
    case 'WORKDAY':
      matchesDayType = isWeekday;
      break;
    case 'WEEKEND':
      matchesDayType = isWeekend;
      break;
    case 'HOLIDAY':
      // Holidays are not automatically detected; treat as custom
      matchesDayType = true;
      break;
    case 'EXAM_DAY':
      matchesDayType = true; // Would need exam day definitions
      break;
    case 'LOW_ENERGY':
      matchesDayType = true; // Would need low energy day definitions
      break;
    case 'CUSTOM':
    default:
      matchesDayType = true;
      break;
  }

  if (!matchesDayType) {
    // Skip to next matching day
    let daysAhead = 1;
    while (daysAhead < 7) {
      const checkDate = addDays(now, daysAhead);
      const checkDayOfWeek = checkDate.getDay();
      const checkIsWeekday = checkDayOfWeek >= 1 && checkDayOfWeek <= 5;
      const checkIsWeekend = checkDayOfWeek === 0 || checkDayOfWeek === 6;

      let checkMatches = false;
      if (dayType === 'WORKDAY') checkMatches = checkIsWeekday;
      else if (dayType === 'WEEKEND') checkMatches = checkIsWeekend;
      else checkMatches = true;

      if (checkMatches) {
        // Set the time on the found date
        const result = new Date(checkDate);
        result.setHours(hours, minutes, 0, 0);
        return result;
      }
      daysAhead++;
    }
    return null;
  }

  // Today matches the dayType - check if the time has already passed today
  const todayDate = startOfDay(now);
  const targetToday = new Date(todayDate);
  targetToday.setHours(hours, minutes, 0, 0);

  // If the time has already passed today and it's not overnight, schedule for next matching day
  if (!isOvernight && now > targetToday) {
    // Search forward for the next matching day
    let daysAhead = 1;
    while (daysAhead < 7) {
      const checkDate = addDays(now, daysAhead);
      const checkDayOfWeek = checkDate.getDay();
      const checkIsWeekday = checkDayOfWeek >= 1 && checkDayOfWeek <= 5;
      const checkIsWeekend = checkDayOfWeek === 0 || checkDayOfWeek === 6;

      let checkMatches = false;
      if (dayType === 'WORKDAY') checkMatches = checkIsWeekday;
      else if (dayType === 'WEEKEND') checkMatches = checkIsWeekend;
      else checkMatches = true;

      if (checkMatches) {
        const result = new Date(startOfDay(checkDate));
        result.setHours(hours, minutes, 0, 0);
        return result;
      }
      daysAhead++;
    }
    return null;
  }

  // Time has not passed today OR it's overnight - schedule for today
  const result = new Date(todayDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Schedule routine block start notifications
 * For each active recurring routine block, calculate the next occurrence
 * and create a pending notification if within the notification window.
 */
export async function scheduleRoutineBlockNotifications(userId: string) {
  try {
    // Honour the master switch and the per-category routine toggles before
    // doing any work. A user who turned routine notifications off should not
    // get rows queued for them at all.
    const preferences = await getNotificationPreferences(userId);
    if (preferences?.notificationsEnabled === false) {
      return 0;
    }
    if (preferences?.routineStartNotifications === false) {
      return 0;
    }

    // Get user's timezone
    const timezone = preferences?.timezone ?? (await getUserTimezone(userId));
    const now = toZonedTime(new Date(), timezone);

    // How long before a block starts the reminder should be delivered. 0 means
    // "at start time". Read from settings; was previously hardcoded to 0 with
    // a "Could be read from user settings" comment. The advance only applies
    // while the user has advance ("upcoming routine") notifications enabled —
    // turning that off pins reminders to the block's start time.
    const advanceMinutes =
      preferences?.upcomingRoutineNotifications === false
        ? 0
        : Math.max(0, preferences?.advanceNotificationMinutes ?? 0);

    // Get all active routine blocks for the user
    // We need to include the template to get dayType
    const routineBlocks = await prisma.routineBlock.findMany({
      where: {
        userId,
        isRecurring: true,
      },
      include: {
        template: {
          select: {
            dayType: true,
            isActive: true,
          },
        },
      },
      take: 200,
    });

    const notifications = [];
    const seenBlocks = new Set<string>();

    for (const block of routineBlocks) {
      // Skip if template is not active
      if (!block.template?.isActive) continue;

      // Skip if we've already processed this block. Key on the block id, not on
      // sortOrder: sortOrder is a mutable display position that gets swapped when
      // the user reorders a template, and nothing enforces its uniqueness, so two
      // blocks sharing a value would cause the second to be silently skipped.
      const blockKey = block.id;
      if (seenBlocks.has(blockKey)) continue;
      seenBlocks.add(blockKey);

      // Calculate next occurrence
      const nextOccurrence = getNextOccurrence(
        block.startTime,
        block.isOvernight,
        block.template.dayType,
        now
      );

      if (!nextOccurrence) continue;

      // Only schedule if within the next 24 hours
      const diffMinutes = differenceInMinutes(nextOccurrence, now);
      if (diffMinutes < 0 || diffMinutes > 24 * 60) continue;

      // Check for duplicate notifications
      const duplicate = await existsPendingNotification(
        userId,
        block.id,
        'ROUTINE_START' as NotificationType
      );
      if (duplicate) continue;

      // Deliver `advanceNotificationMinutes` before the block starts. The
      // notification still fires at the start time if the advanced time has
      // already passed, so turning the advance up never skips a reminder.
      let scheduledTime = new Date(nextOccurrence.getTime() - advanceMinutes * 60 * 1000);

      // Make sure we don't schedule in the past
      if (scheduledTime <= now) {
        // Schedule at the start time instead
        scheduledTime = new Date(nextOccurrence.getTime());
      }

      notifications.push({
        userId,
        type: 'ROUTINE_START' as NotificationType,
        title: `${block.title} Time`,
        body: `Your ${block.title} session starts now.`,
        actionUrl: `/today?block=${block.id}`,
        relatedEntityId: block.id,
        scheduledFor: scheduledTime,
        // Include block info in data for reference
        data: {
          blockId: block.id,
          routineTitle: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
        },
      });
    }

    // Bulk create notifications
    if (notifications.length > 0) {
      await Promise.all(
        notifications.map(n => scheduleNotification(
          n.userId,
          n.type,
          n.scheduledFor,
          {
            title: n.title,
            body: n.body,
            actionUrl: n.actionUrl,
            relatedEntityId: n.relatedEntityId,
            data: n.data,
          }
        ))
      );
    }

    return notifications.length;
  } catch (error) {
    console.error('Error scheduling routine block notifications:', error);
    throw error;
  }
}

/**
 * Schedule the user's daily habit-logging reminder for today.
 *
 * `UserSettings.dailyReminder` and `dailyReminderTime` were previously exposed
 * on two settings pages and persisted, but nothing ever read them — there was
 * no producer at all, so the switch could not do anything. This closes that
 * loop: the row is created once per day, at the user's configured local time,
 * and the dispatcher (which already honours `notificationsEnabled`) delivers
 * it.
 *
 * Idempotent: re-running within the same day is a no-op because the
 * `relatedEntityId` is the local date.
 *
 * @returns the number of notifications created (0 or 1).
 */
export async function scheduleDailyReminder(userId: string): Promise<number> {
  const preferences = await getNotificationPreferences(userId);
  if (!preferences) return 0;
  if (preferences.notificationsEnabled === false) return 0;

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      dailyReminder: true,
      dailyReminderTime: true,
      habitReminders: true,
      timezone: true,
    },
  });

  if (!settings?.dailyReminder) return 0;
  if (settings.habitReminders === false) return 0;

  // Default to 20:00 when the user enabled the switch but never picked a time.
  const time = settings.dailyReminderTime?.trim() || '20:00';
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return 0;

  const timezone = preferences.timezone ?? 'Asia/Kolkata';
  const now = toZonedTime(new Date(), timezone);
  const localDate = getTodayString(timezone);

  const existing = await prisma.notificationLog.count({
    where: {
      userId,
      type: NotificationType.HABIT_REMINDER,
      relatedEntityId: `daily:${localDate}`,
      status: 'PENDING',
    },
  });
  if (existing > 0) return 0;

  // Only queue it once the reminder time has actually arrived today, so the
  // dispatcher picks it up on the next pass rather than at midnight.
  if (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes)) {
    /**
     * `scheduledFor` must be the **absolute instant** of the user's chosen
     * wall-clock time, not a `Date` whose system-local fields merely read like
     * it.
     *
     * This previously did `const scheduled = new Date(now); scheduled.setHours(hours, minutes, 0, 0)`.
     * `toZonedTime` already shifted `now` so that `getHours()` returns the
     * user's wall clock, so this produced a `Date` carrying the intended
     * wall-clock reading — but Prisma persists the underlying timestamp, which
     * is that reading interpreted in the *server's* zone. For `Asia/Kolkata`
     * (+05:30) a 20:00 reminder was stored 5h30m out and fired at the wrong
     * time.
     *
     * `fromZonedTime` is the correct inverse of `toZonedTime` and is what
     * `src/lib/dates.ts` already uses.
     */
    const scheduled = fromZonedTime(
      `${localDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000`,
      timezone
    );

    await prisma.notificationLog.create({
      data: {
        userId,
        type: NotificationType.HABIT_REMINDER,
        title: 'Daily check-in',
        body: 'Take a moment to log today’s habits and see your daily score.',
        actionUrl: '/today',
        relatedEntityId: `daily:${localDate}`,
        scheduledFor: scheduled,
        status: 'PENDING',
      },
    });
    return 1;
  }

  return 0;
}

/**
 * Get notifications that should be sent now (scheduledFor <= now)
 */
export async function getNotificationsToSend(userId: string, beforeDate: Date = new Date()) {
  return await prisma.notificationLog.findMany({
    where: {
      userId,
      status: 'PENDING',
      scheduledFor: { lte: beforeDate },
    },
    take: 100,
  });
}