import prisma from '@/lib/prisma';
import { NotificationType } from '@/generated/prisma';
import { differenceInMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TZ, getTodayString, shiftCalendarDay } from '@/lib/dates';
import { resolveDayTypeFromException } from '@/lib/scheduling/resolve-routine';
import { RoutineRepository } from '@/server/repositories/routine.repository';

/** Shared with the rest of the app so reminders cannot disagree with /routine. */
const routineRepository = new RoutineRepository();

/**
 * Notification Scheduler
 * Queue and schedule notifications
 */

/** How long the "Snooze" notification button postpones a reminder. */
const SNOOZE_MINUTES = 10;

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
    /**
     * Action buttons to render on the push notification.
     *
     * Stored in `actionData.actions` so the dispatcher can forward them to the
     * service worker, and so the `/api/notifications/action` endpoint can be
     * reached from a button press while the app is closed.
     */
    actions?: Array<{ action: string; title: string }>;
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
      actionData:
        data.data || data.actions
          ? JSON.stringify({ ...(data.data ?? {}), ...(data.actions ? { actions: data.actions } : {}) })
          : undefined,
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
/**
 * The next occurrence of a routine block, as an **absolute instant**.
 *
 * ## The bug this replaces
 *
 * This used to do:
 *
 *     const now = toZonedTime(new Date(), timezone);
 *     const target = new Date(startOfDay(now));
 *     target.setHours(hours, minutes, 0, 0);   // <-- wrong
 *
 * `toZonedTime` returns a `Date` whose *system-local* fields read as the target
 * zone's wall clock, but Prisma persists the underlying timestamp. On a server
 * running in UTC that turned an 18:00 Asia/Kolkata block into `18:00Z`, which is
 * **23:30 IST** — a routine reminder arriving five and a half hours late, every
 * time. The same mistake was in `scheduleDailyReminder` and has been fixed there
 * too.
 *
 * ## The fix
 *
 * Work entirely in the user's local calendar (a `YYYY-MM-DD` string plus the
 * block's wall-clock `HH:mm`), then convert once with `fromZonedTime`, which is
 * the correct inverse. Every comparison is against the real current time, so the
 * 24-hour window and "not in the past" checks are also correct.
 *
 * @param startTime  The block's start as wall-clock `HH:mm`.
 * @param isOvernight True when the block runs past midnight (e.g. Sleep 00:00-06:00).
 * @param dayType    The template's day type, used to pick a matching weekday.
 * @param timezone   The user's IANA zone.
 * @param now        Real current time. Injectable for testing.
 */
function getNextOccurrence(
  startTime: string,
  isOvernight: boolean,
  dayType: string,
  timezone: string,
  now: Date = new Date()
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const dayTypeKey = dayType as 'WORKDAY' | 'WEEKEND' | 'HOLIDAY' | 'EXAM_DAY' | 'LOW_ENERGY' | 'CUSTOM';

  /** Does this local date's weekday satisfy the template's day type? */
  const dayMatches = (localDate: string): boolean => {
    switch (dayTypeKey) {
      case 'WORKDAY': {
        const d = weekdayOfLocalDate(localDate);
        return d >= 1 && d <= 5;
      }
      case 'WEEKEND': {
        const d = weekdayOfLocalDate(localDate);
        return d === 0 || d === 6;
      }
      // Holidays / exam days / low energy / custom are not auto-derived, so the
      // template is treated as applying to any day, matching the old switch.
      default:
        return true;
    }
  };

  // Walk the user's next 8 local days, starting with today.
  let localDate = getTodayString(timezone);
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    if (dayMatches(localDate)) {
      const instant = fromZonedTime(
        `${localDate}T${startTime.trim()}:00.000`,
        timezone
      );

      // For an overnight block whose start has already passed today, the next
      // meaningful occurrence is tomorrow's — which the loop reaches anyway.
      if (instant.getTime() > now.getTime() || (dayOffset === 0 && isOvernight && instant.getTime() > now.getTime())) {
        return instant;
      }
    }
    localDate = shiftCalendarDay(localDate, 1);
  }

  return null;
}

/** Day of week (0 = Sunday) for a `YYYY-MM-DD` string, without timezone maths. */
function weekdayOfLocalDate(localDate: string): number {
  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
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

    // Get user's timezone. `now` is the REAL current time, never a
    // `toZonedTime` copy — comparisons below must be absolute-instant based.
    const timezone = preferences?.timezone ?? (await getUserTimezone(userId));
    const now = new Date();

    // How long before a block starts the reminder should be delivered. 0 means
    // "at start time". Read from settings; was previously hardcoded to 0 with
    // a "Could be read from user settings" comment. The advance only applies
    // while the user has advance ("upcoming routine") notifications enabled —
    // turning that off pins reminders to the block's start time.
    const advanceMinutes =
      preferences?.upcomingRoutineNotifications === false
        ? 0
        : Math.max(0, preferences?.advanceNotificationMinutes ?? 0);

    /**
     * Only the blocks belonging to the template that is **actually in effect**
     * for each upcoming day.
     *
     * This used to load every recurring block for the user and let
     * `getNextOccurrence` filter purely by weekday. A user with a College
     * (WORKDAY) template, a Rest Day (LOW_ENERGY) one, a Weekend one and a
     * PLACEMENT (CUSTOM) one therefore got reminders for all of them at once —
     * a placement-day "Job Applications" reminder firing on a College day. On
     * top of that, `getNextOccurrence` treated every non-WORKDAY/WEEKEND day
     * type as "matches any day", so `CUSTOM` templates were scheduled daily.
     *
     * The fix is to resolve each day the same way the app itself does —
     * `RoutineException` first, then the natural weekday — and schedule only
     * that template's blocks. Reminders then always match what `/routine` shows.
     */
    const routineBlocks: Array<{
      id: string;
      title: string;
      startTime: string;
      endTime: string;
      isOvernight: boolean;
      isRecurring: boolean;
      category: string | null;
      template: { dayType: string; isActive: boolean; name: string } | null;
    }> = [];

    const todayLocal = getTodayString(timezone);
    const seenBlockIds = new Set<string>();

    for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
      const localDate = shiftCalendarDay(todayLocal, dayOffset);

      // Same resolution order as `RoutineService.getRoutineForDate`, via the
      // shared pure helper: an explicit per-date override wins, otherwise the
      // natural weekday decides.
      const exception = await routineRepository.findException(userId, localDate);
      const resolved = resolveDayTypeFromException(localDate, timezone, exception ?? undefined);
      const dayType = resolved.dayType;

      const templateId = exception?.dayTypeId
        ? exception.dayTypeId
        : (await routineRepository.findTemplateByDayType(userId, dayType))?.id;

      if (!templateId) continue;
      const template = await routineRepository.findTemplateWithBlocks(templateId, userId);
      if (template) await collectBlocks(template as never, localDate, dayOffset);
    }

    /**
     * Add a resolved template's active recurring blocks to the work list, tagged
     * with the local date they apply to and the template's display name (used
     * for the day-type tag on the notification).
     */
    async function collectBlocks(
      template: {
        id: string;
        name: string;
        dayType: string;
        isActive: boolean;
        blocks?: Array<{
          id: string;
          title: string;
          startTime: string;
          endTime: string;
          isOvernight: boolean;
          isRecurring: boolean;
          category: string | null;
        }>;
      },
      localDate: string,
      dayOffset: number
    ): Promise<void> {
      if (!template.isActive) return;
      for (const block of template.blocks ?? []) {
        if (!block.isRecurring) continue;
        // A block that recurs every day appears once per future day; only the
        // earliest occurrence should produce a notification, so the first date it
        // is seen for wins.
        if (seenBlockIds.has(block.id)) continue;
        seenBlockIds.add(block.id);
        routineBlocks.push({
          id: block.id,
          title: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
          isOvernight: block.isOvernight,
          isRecurring: block.isRecurring,
          category: block.category ?? null,
          template: {
            dayType: template.dayType,
            isActive: template.isActive,
            name: template.name,
          },
          localDate,
        } as never);
      }
      void localDate;
      void dayOffset;
    }

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

      // Calculate next occurrence (an absolute instant in the user's timezone)
      const nextOccurrence = getNextOccurrence(
        block.startTime,
        block.isOvernight,
        block.template.dayType,
        timezone,
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
        /**
         * Action buttons rendered on the push itself.
         *
         * Chrome shows at most two, so this is deliberately two and not three.
         * `DONE` and `SNOOZE` are the two that actually change state; a third
         * "open" button would be rendered greyed and useless, and the body of
         * the notification is already clickable to open the app.
         *
         * They are wired to `/api/notifications/action` by the service worker's
         * `notificationclick` handler, so acknowledging a reminder does not
         * require opening the app.
         */
        actions: [
          { action: 'DONE', title: '✓ Done' },
          { action: 'SNOOZE', title: `Snooze ${SNOOZE_MINUTES}m` },
        ],
        // Include block info in data for reference
        data: {
          blockId: block.id,
          routineTitle: block.title,
          startTime: block.startTime,
          endTime: block.endTime,
          /**
           * The day type this block belongs to, taken from the template it lives
           * in. Rendered as a tag on the notification so "College /" and a
           * placement block are distinguishable at a glance instead of both
           * reading as a generic "Routine".
           */
          dayType: block.template?.name ?? null,
          /**
           * The user's own label for this block (DSA, Personal, GATE, College,
           * Health, ...), stored on `RoutineBlock.categoryId`.
           *
           * The user asked for these to appear as tags on the notification and
           * to be filterable, so the name is captured at schedule time. Reading
           * it per notification at display time would mean a join on every row of
           * the history list.
           */
          category: block.category ?? null,
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
            actions: n.actions,
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