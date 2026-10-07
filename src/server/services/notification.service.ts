import { NotificationType, NotificationStatus, type NotificationLog } from '@/generated/prisma';
import { z } from 'zod';
import {
  NotificationRepository,
  type DeliveryChannels,
} from '@/server/repositories/notification.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { sendEmail } from '@/lib/email/sender';
import { ACHIEVEMENTS_PATH, achievementDeepLink } from '@/lib/achievements/links';
import { renderSimpleHtml } from '@/lib/email/html';
import { pushService } from '@/server/services/push.service';
import { toUserIdOptional, toUserId, type UserId  } from '@/types/ids';

/**
 * Notification Service
 * Business logic for user notifications (in-app, reminders, achievements)
 */

/**
 * `SLEEP_PROMPT` is delivered inline by `SleepSessionService`, which fires on
 * the user's own bedtime/wake window rather than on `scheduledFor`. Excluding it
 * here keeps a single owner per row and prevents double-sending.
 */
const DISPATCH_EXCLUDED_TYPES: NotificationType[] = [NotificationType.SLEEP_PROMPT];

/** Per-run cap, so one invocation cannot exhaust the cron's 60s budget. */
const DISPATCH_BATCH_SIZE = 100;

/** Give up on a row after this many failed attempts. */
const DISPATCH_MAX_RETRIES = 3;

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  byChannel: DeliveryChannels;
}

/**
 * The `UserSettings` columns that decide whether a given notification type may
 * be delivered at all.
 *
 * These switches are exposed on Settings > Notifications. Before this map
 * existed they were persisted but never read: the page saved them, showed a
 * green "Saved" badge, and the dispatcher ignored them, so opting out of habit
 * reminders had no effect on delivery. Gating here — the single choke point
 * every queued row passes through — makes them authoritative.
 *
 * A notification with no entry is always delivered (subject to the master
 * `notificationsEnabled` switch), so new types are not silently dropped.
 */
const CATEGORY_GATES: Partial<Record<NotificationType, keyof CategorySettings>> = {
  [NotificationType.HABIT_REMINDER]: 'habitReminders',
  [NotificationType.GOAL_DEADLINE]: 'goalReminders',
  [NotificationType.ROUTINE_START]: 'routineStartNotifications',
  [NotificationType.SLEEP_TRACKING_STARTED]: 'sleepReminderNotifications',
};

/** The settings columns referenced by {@link CATEGORY_GATES}. */
type CategorySettings = {
  habitReminders: boolean | null;
  goalReminders: boolean | null;
  routineStartNotifications: boolean | null;
  sleepReminderNotifications: boolean | null;
};

const createNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1, 'Title is required').max(160),
  body: z.string().max(2000).optional(),
  relatedEntityId: z.string().optional(),
  actionUrl: z.string().max(500).optional(),
  actionData: z.record(z.string(), z.unknown()).optional(),
  scheduledFor: z.date().optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  actionData?: Record<string, unknown>;
  scheduledFor?: Date;
  status?: NotificationStatus;
}

/**
 * Split the `actionData` JSON column into the parts the push payload needs.
 *
 * `actions` is lifted out because it is a structured field, not free-form data.
 * The remainder is forwarded to the service worker untouched. Malformed JSON is
 * tolerated: a malformed column must not stop the notification being delivered.
 */
function parseActionData(raw: string | null | undefined): {
  actions: Array<{ action: string; title: string }>;
  rest: Record<string, unknown>;
  promptId?: string;
} {
  if (!raw) return { actions: [], rest: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { actions: [], rest: {} };
  }
  if (typeof parsed !== 'object' || parsed === null) return { actions: [], rest: {} };

  const record = parsed as Record<string, unknown>;
  const rawActions = Array.isArray(record.actions) ? record.actions : [];
  const actions = rawActions
    .filter(
      (a): a is { action: string; title: string } =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as { action?: unknown }).action === 'string' &&
        typeof (a as { title?: unknown }).title === 'string'
    )
    .slice(0, 2);

  const { actions: _omitted, ...rest } = record;
  return {
    actions,
    rest,
    promptId: typeof record.promptId === 'string' ? record.promptId : undefined,
  };
}

export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Create a notification for a user
   */
  async createNotification(
    userId: UserId,
    input: CreateNotificationInput,
  ): Promise<NotificationLog> {
    const parsed = createNotificationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message ?? 'Invalid notification data');
    }

    return this.notificationRepository.create(userId, {
      type: parsed.data.type,
      relatedEntityId: parsed.data.relatedEntityId,
      title: parsed.data.title,
      body: parsed.data.body,
      actionUrl: parsed.data.actionUrl,
      actionData: parsed.data.actionData ? JSON.stringify(parsed.data.actionData) : undefined,
      scheduledFor: parsed.data.scheduledFor ?? new Date(),
      status: parsed.data.status,
      sentAt: parsed.data.status === NotificationStatus.SENT ? new Date() : undefined,
    });
  }

  /**
   * List notifications for a user
   */
  async getNotifications(
    userId: UserId,
    query: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<NotificationLog[]> {
    return this.notificationRepository.findAll(userId, {
      unreadOnly: query.unreadOnly,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  /**
   * The notification history feed behind `GET /api/notifications`.
   *
   * Supports the two filters the data can actually answer - `period`, applied to
   * `createdAt`, and `limit`/`offset` paging.
   *
   * `category` and `tag` are accepted by the route's query schema but are
   * deliberately not applied here: `NotificationLog` has no `category` column and
   * no tag relation, and its `type` is a different taxonomy (`ROUTINE_REMINDER`,
   * `HABIT_REMINDER`, ...) from the route's `category` vocabulary (`routine`,
   * `habits`, ...). There is no honest mapping, and silently returning unfiltered
   * rows would render a "Routine" filter over everything. Giving them real
   * meaning needs a column, which is a schema change rather than a service one.
   */
  async getHistory(
    userId: UserId,
    query: {
      limit?: number;
      offset?: number;
      category?: string;
      tag?: string;
      period?: 'all' | 'day' | 'week' | 'month' | 'year';
    } = {},
  ): Promise<NotificationLog[]> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const period = query.period ?? 'all';
    if (period === 'all') {
      return this.notificationRepository.findAll(userId, { limit, offset });
    }

    // Anchored on the host clock here because the row filter is a storage concern
    // (which rows fall in the window), not an attribution rule the user's timezone
    // would change the meaning of.
    const since = new Date();
    switch (period) {
      case 'day':
        since.setUTCDate(since.getUTCDate() - 1);
        break;
      case 'week':
        since.setUTCDate(since.getUTCDate() - 7);
        break;
      case 'month':
        since.setUTCMonth(since.getUTCMonth() - 1);
        break;
      case 'year':
        since.setUTCFullYear(since.getUTCFullYear() - 1);
        break;
    }

    return this.notificationRepository.findAllSince(userId, since, { limit, offset });
  }

  /**
   * Apply an action tapped on a notification.
   *
   * The push action buttons render on the notification itself, where there is no
   * session to authorize against, so this is reached from an authenticated
   * request that already carries `userId`; every branch below scopes by that id
   * rather than trusting the id in the body.
   *
   * `DONE` and `SKIP` both close the notification out but mean different things
   * to the history feed - read versus dismissed - so they are not collapsed.
   *
   * Routine check-in actions:
   * - `STARTED_ON_TIME` / `STARTED_LATE` / `STARTED_EARLY` - start check-in responses
   * - `BUSY_WITH_OTHER` - user is doing something else instead
   * - `SKIP_BLOCK` - user doesn't want to do the task
   * - `FINISHED_ON_TIME` / `FINISHED_LATE` / `FINISHED_EARLY` - completion check-in responses
   * - `NOT_COMPLETED` - user explicitly says they didn't complete
   */
  async applyAction(
    userId: UserId,
    notificationId: string,
    action: 'DONE' | 'SNOOZE' | 'SKIP' | 'STARTED_ON_TIME' | 'STARTED_LATE' | 'STARTED_EARLY' | 'BUSY_WITH_OTHER' | 'SKIP_BLOCK' | 'FINISHED_ON_TIME' | 'FINISHED_LATE' | 'FINISHED_EARLY' | 'NOT_COMPLETED',
    options?: { 
      snoozeMinutes?: number; 
      actualStartTime?: string; 
      actualEndTime?: string;
      replacementActivity?: string;
    }
  ): Promise<NotificationLog | { snoozed: boolean; scheduledFor: Date }> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }

    // Handle routine check-in actions
    const isStartCheckIn = action.startsWith('STARTED_');
    const isCompletionCheckIn = action.startsWith('FINISHED_') || action === 'NOT_COMPLETED';
    const isBusyWithOther = action === 'BUSY_WITH_OTHER';
    const isSkipBlock = action === 'SKIP_BLOCK';

    if (isStartCheckIn || isCompletionCheckIn || isBusyWithOther || isSkipBlock) {
      return this.handleRoutineCheckIn(userId, existing, action, options);
    }

    if (action === 'DONE') {
      return this.notificationRepository.markRead(userId, notificationId);
    }

    if (action === 'SKIP') {
      const dismissed = await this.notificationRepository.markDismissed(userId, notificationId);
      if (dismissed === 0) {
        throw new Error('Notification could not be dismissed');
      }
      return this.notificationRepository.findById(userId, notificationId).then((row) => {
        if (!row) throw new Error('Notification not found');
        return row;
      });
    }

    const scheduledFor = new Date(Date.now() + (options?.snoozeMinutes ?? 10) * 60 * 1000);
    const snoozed = await this.notificationRepository.snooze(userId, notificationId, scheduledFor);
    if (snoozed === 0) {
      throw new Error('Notification is no longer pending and cannot be snoozed');
    }
    return { snoozed: true, scheduledFor };
  }

  /**
   * Handle routine block check-in responses.
   * Updates the notification and creates/updates the RoutineLog.
   */
  private async handleRoutineCheckIn(
    userId: UserId,
    notification: any,
    action: string,
    options?: { actualStartTime?: string; actualEndTime?: string; replacementActivity?: string }
  ): Promise<NotificationLog> {
    // Mark notification as read/responded
    const updatedNotification = await this.notificationRepository.markReadWithCheckIn(
      userId,
      notification.id,
      action,
      options?.actualStartTime,
      options?.actualEndTime,
      options?.replacementActivity
    );

    // If this is a routine check-in notification, update the RoutineLog
    if (notification.type === 'ROUTINE_START_CHECKIN' || notification.type === 'ROUTINE_COMPLETION_CHECKIN') {
      const blockId = notification.routineBlockId;
      const blockDate = notification.blockDate;
      
      if (blockId && blockDate) {
        await this.updateRoutineLogFromCheckIn(userId, blockId, blockDate, action, options);
      }
    }

    return updatedNotification;
  }

  /**
   * Update RoutineLog based on check-in response.
   */
  private async updateRoutineLogFromCheckIn(
    userId: UserId,
    blockId: string,
    blockDate: string,
    action: string,
    options?: { actualStartTime?: string; actualEndTime?: string; replacementActivity?: string }
  ): Promise<void> {
    const routineRepo = new (await import('@/server/repositories/routine.repository')).RoutineRepository();
    
    const existingLog = await routineRepo.findLog(blockId, toUserId(userId), blockDate);
    
    const isStartCheckIn = action.startsWith('STARTED_');
    const isCompletionCheckIn = action.startsWith('FINISHED_') || action === 'NOT_COMPLETED';
    const isBusyWithOther = action === 'BUSY_WITH_OTHER';
    const isSkipBlock = action === 'SKIP_BLOCK';

    // Determine the status and times from the action
    let status: 'COMPLETED' | 'MISSED' | 'PARTIAL' | 'IN_PROGRESS' = 'IN_PROGRESS';
    let actualStartTime: string | null = null;
    let actualEndTime: string | null = null;
    let completionSource: 'USER_CONFIRMED' | 'AUTO_ASSUMED' | 'MANUAL_EDIT' | 'CHECKIN_COMPLETION' | undefined;
    let note: string | null = null;

    if (isStartCheckIn) {
      if (action === 'STARTED_ON_TIME') {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
      } else if (action === 'STARTED_LATE' || action === 'STARTED_EARLY') {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
      } else if (isBusyWithOther) {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
        note = `Replaced with: ${options?.replacementActivity ?? 'Other activity'}`;
      } else if (isSkipBlock) {
        status = 'MISSED';
        completionSource = 'USER_CONFIRMED';
      }
    } else if (isCompletionCheckIn) {
      if (action === 'NOT_COMPLETED') {
        status = 'MISSED';
        completionSource = 'USER_CONFIRMED';
      } else {
        status = 'COMPLETED';
        actualEndTime = options?.actualEndTime ?? null;
        // If start wasn't confirmed earlier, use the start from options or scheduled time
        if (!existingLog?.actualStartTime) {
          actualStartTime = options?.actualStartTime ?? null;
        }
        completionSource = 'USER_CONFIRMED';
      }
    }

    // Calculate duration if both times available
    let durationMinutes: number | null = null;
    if (actualStartTime && actualEndTime) {
      const startParts = actualStartTime.split(':');
      const endParts = actualEndTime.split(':');
      const startH = Number(startParts[0]);
      const startM = Number(startParts[1]);
      const endH = Number(endParts[0]);
      const endM = Number(endParts[1]);
      if (!Number.isNaN(startH) && !Number.isNaN(startM) && !Number.isNaN(endH) && !Number.isNaN(endM)) {
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        durationMinutes = endMinutes >= startMinutes ? endMinutes - startMinutes : (24 * 60 - startMinutes) + endMinutes;
      }
    }

    await routineRepo.upsertLog(toUserId(userId), blockId, blockDate, {
      status,
      actualStartTime,
      actualEndTime,
      durationMinutes,
      note,
      completionSource,
    });
  }

  /**
   * Get unread notification count for the badge
   */
  async getUnreadCount(userId: UserId): Promise<number> {
    return this.notificationRepository.unreadCount(userId);
  }

  /**
   * Mark a single notification as read (ownership-checked)
   */
  async markRead(userId: UserId, notificationId: string): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    return this.notificationRepository.markRead(userId, notificationId);
  }

  /**
   * Mark all notifications as read; returns affected count
   */
  async markAllRead(userId: UserId): Promise<{ success: boolean; count: number }> {
    const count = await this.notificationRepository.markAllRead(userId);
    return { success: true, count };
  }

  /**
   * Dismiss a single notification (ownership-checked; idempotent).
   */
  async dismiss(userId: UserId, notificationId: string): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    const dismissed = await this.notificationRepository.markDismissed(userId, notificationId);
    if (dismissed === 0) {
      return existing;
    }
    return { ...existing, status: NotificationStatus.DISMISSED };
  }

  /**
   * Delete a notification (ownership-checked)
   */
  async delete(userId: UserId, notificationId: string): Promise<{ success: boolean }> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    await this.notificationRepository.delete(userId, notificationId);
    return { success: true };
  }

  /**
   * Notify the user that a goal is due soon or overdue
   */
  async notifyGoalDue(
    userId: UserId,
    goal: { id: string; title: string; dueDate?: Date | null; endDate?: Date | null },
  ): Promise<NotificationLog> {
    return this.createNotification(userId, {
      type: NotificationType.GOAL_DEADLINE,
      title: `Goal due: ${goal.title}`,
      body:
        (goal.dueDate ?? goal.endDate)
          ? `Your goal "${goal.title}" is due on ${
              (goal.dueDate ?? goal.endDate)?.toISOString().split('T')[0]
            }.`
          : `Your goal "${goal.title}" is approaching its deadline.`,
      relatedEntityId: goal.id,
      actionUrl: `/goals/${goal.id}`,
      scheduledFor: new Date(),
    });
  }

  /**
   * Notify the user about a habit reminder
   */
  async notifyHabitReminder(
    userId: UserId,
    habit: { id: string; name: string },
    scheduledFor: Date = new Date(),
  ): Promise<NotificationLog> {
    return this.createNotification(userId, {
      type: NotificationType.HABIT_REMINDER,
      title: `Habit reminder: ${habit.name}`,
      body: `Don't forget to complete "${habit.name}" today.`,
      relatedEntityId: habit.id,
      actionUrl: `/habits/${habit.id}`,
      scheduledFor,
    });
  }

  /**
   * Notify the user that an achievement was unlocked.
   *
   * `actionUrl` used to be `/achievements/${achievement.id}`, which is a 404: the
   * page is one route at `/achievements` with no `[id]` segment. It is now built
   * by `achievementDeepLink` from the **definition** id, which is what the page's
   * `?highlight=` reads. `id` stays in the signature because it is also recorded as
   * `relatedEntityId`, which is the row and genuinely is the row.
   */
  async notifyAchievement(
    userId: UserId,
    achievement: { id: string; title: string; definitionId?: string | null },
    scheduledFor: Date = new Date(),
  ): Promise<NotificationLog> {
    const definitionId = achievement.definitionId ?? null;
    return this.createNotification(userId, {
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: `Achievement unlocked: ${achievement.title}`,
      body: `You unlocked the "${achievement.title}" achievement. Keep it up!`,
      relatedEntityId: achievement.id,
      actionUrl: definitionId === null ? ACHIEVEMENTS_PATH : achievementDeepLink(definitionId),
      scheduledFor,
    });
  }

  /**
   * Deliver every notification whose `scheduledFor` has now passed.
   *
   * Without this, the routine/habit/goal/weekly reminder modules enqueue rows
   * that stay `PENDING` forever: nothing else reads them on a wall clock.
   * (`SLEEP_PROMPT` is excluded — see `DISPATCH_EXCLUDED_TYPES`.)
   *
   * In-app delivery needs no work: the row itself is the in-app notification
   * and is already visible, because `findAll` filters on `readAt`/`dismissedAt`
   * rather than `status`. So a row is only "sent" once its out-of-app channels
   * have been attempted, and the channel flags record what actually went out.
   *
   * Failures are recorded per row and never abort the batch, so one bad
   * address cannot block the rest of the queue.
   */
  async dispatchDueNotifications(
    limitOrOptions: number | { limit?: number; userId?: string } = DISPATCH_BATCH_SIZE,
  ): Promise<DispatchResult> {
    const options =
      typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
    const limit = options.limit ?? DISPATCH_BATCH_SIZE;
    const now = new Date();
    const result: DispatchResult = {
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      byChannel: { email: false, push: false, sms: false },
    };

    const due = await this.notificationRepository.findDueForDispatch(
      now,
      limit,
      DISPATCH_EXCLUDED_TYPES,
      toUserIdOptional(options.userId),
      DISPATCH_MAX_RETRIES,
    );
    result.claimed = due.length;

    for (const notification of due) {
      const settings = notification.user.settings;

      // No settings row means notifications were never configured; treat the
      // default as "on" so a fresh user still gets reminders.
      const enabled = settings?.notificationsEnabled ?? true;
      if (!enabled) {
        // Opted out everywhere: retire the row without contacting any channel.
        const marked = await this.notificationRepository.markSent(
          toUserId(notification.userId),
          notification.id,
        );
        if (marked > 0) result.skipped += 1;
        continue;
      }

      // Per-category opt-out. A user who switched off habit reminders must not
      // receive queued habit reminders even though the master switch is on.
      const gate = CATEGORY_GATES[notification.type];
      if (gate && (settings as CategorySettings | null)?.[gate] === false) {
        const marked = await this.notificationRepository.markSent(
          toUserId(notification.userId),
          notification.id,
        );
        if (marked > 0) result.skipped += 1;
        continue;
      }

      const channels: DeliveryChannels = { email: false, push: false, sms: false };
      const failures: string[] = [];

      if ((settings?.emailNotifications ?? true) && notification.user.email) {
        try {
          // `html` is supplied explicitly because the `src/emails` React
          // templates are Node-only (they use `renderToStaticMarkup`, which
          // Turbopack rejects in the App Router server graph). `renderSimpleHtml`
          // is the route-safe equivalent.
          const email = await sendEmail({
            to: notification.user.email,
            subject: notification.title,
            template: 'habit-reminder',
            html: renderSimpleHtml({
              title: notification.title,
              body: notification.body,
              actionUrl: notification.actionUrl,
            }),
          });
          if (email.ok) {
            channels.email = true;
          } else {
            failures.push(email.error ?? 'email send rejected');
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'email threw');
        }
      }

      if (settings?.pushNotifications ?? true) {
        try {
          /**
           * Forward the action buttons and the row's own id.
           *
           * Without `notificationId` the service worker has nothing to send an
           * action button to, so a reminder could only ever be opened, never
           * acknowledged. `actionData` carries `{ actions: [...] }` as written
           * by the routine producer.
           */
          const actionData = parseActionData(notification.actionData);
          const push = await pushService.sendToUser(toUserId(notification.userId), {
            title: notification.title,
            body: notification.body ?? undefined,
            url: notification.actionUrl ?? undefined,
            ...(actionData.actions.length > 0 ? { actions: actionData.actions } : {}),
            data: {
              ...actionData.rest,
              notificationId: notification.id,
              ...(actionData.promptId ? { promptId: actionData.promptId } : {}),
            },
          });
          if (push.sent > 0) channels.push = true;
          /**
           * The actual reason from `pushService` carries the diagnosis — a VAPID
           * mismatch, a dead subscription, an expired endpoint. Collapsing it to
           * "1 push subscription(s) failed" is why a real delivery failure was
           * invisible and had to be reproduced out-of-band to diagnose.
           */
          if (push.failed > 0) {
            failures.push(
              push.reason
                ? `${push.failed} push subscription(s) failed: ${push.reason}`
                : `${push.failed} push subscription(s) failed`
            );
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'push threw');
        }
      }

      if (failures.length > 0) {
        const marked = await this.notificationRepository.markFailed(
          toUserId(notification.userId),
          notification.id,
          failures.join('; '),
          DISPATCH_MAX_RETRIES,
        );
        if (marked > 0) result.failed += 1;
        continue;
      }

      // `markSent` is guarded on status = PENDING, so a row another worker
      // already claimed reports 0 and is not counted twice.
      const marked = await this.notificationRepository.markSent(
        toUserId(notification.userId),
        notification.id,
        channels,
      );
      if (marked > 0) {
        result.sent += 1;
        result.byChannel.email ||= channels.email;
        result.byChannel.push ||= channels.push;
        result.byChannel.sms ||= channels.sms;
      }
    }

    return result;
  }

  /**
   * Cancel all pending notifications for a specific routine block.
   * Called when a block is updated or deleted to prevent stale notifications.
   */
  async cancelBlockNotifications(
    userId: UserId,
    blockId: string
  ): Promise<number> {
    const typesToCancel = [
      NotificationType.ROUTINE_PRE_START,
      NotificationType.ROUTINE_START,
      NotificationType.ROUTINE_COMPLETION,
      NotificationType.ROUTINE_END_REMINDER,
    ];

    let cancelled = 0;
    for (const type of typesToCancel) {
      const pending = await this.notificationRepository.findPendingByType(userId, [type]);
      for (const notification of pending) {
        if (notification.relatedEntityId === blockId) {
          await this.notificationRepository.markDismissed(userId, notification.id);
          cancelled++;
        }
      }
    }
    return cancelled;
  }

  /**
   * Retry unanswered notifications based on user's retry policy.
   * Finds notifications that have been pending for longer than the retry intervals
   * and creates follow-up notifications.
   */
  async retryUnansweredNotifications(
    userId: UserId,
    now: Date = new Date()
  ): Promise<number> {
    const settings = await this.userRepository.getSettings(userId);
    if (!settings?.notificationRetryEnabled) return 0;
    if (settings.notificationsEnabled === false) return 0;

    const retryIntervals = this.parseRetryIntervals(settings.notificationRetryIntervals);
    const maxRetries = settings.notificationMaxRetries ?? 3;

    let retried = 0;

    // Find all pending notifications for this user
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.ROUTINE_PRE_START,
      NotificationType.ROUTINE_START,
      NotificationType.ROUTINE_COMPLETION,
      NotificationType.ROUTINE_END_REMINDER,
      NotificationType.HABIT_REMINDER,
      NotificationType.GOAL_DEADLINE,
    ]);

    for (const notification of pending) {
      // Check if this notification has a retry count in actionData
      const actionData = notification.actionData ? JSON.parse(notification.actionData) : {};
      const retryCount = actionData.retryCount ?? 0;
      const scheduledFor = new Date(notification.scheduledFor);
      const elapsedMinutes = (now.getTime() - scheduledFor.getTime()) / 60000;

      // Check if we should retry based on intervals
      const nextInterval = retryIntervals[retryCount];
      if (nextInterval === undefined || retryCount >= maxRetries) continue;
      if (elapsedMinutes < nextInterval) continue;

      // Create a follow-up notification
      await this.createRetryNotification(userId, notification, retryCount + 1);
      retried++;
    }

    return retried;
  }

  private parseRetryIntervals(intervalsJson: string | null | undefined): number[] {
    if (!intervalsJson) return [5, 15, 30]; // Default: 5min, 15min, 30min
    try {
      const parsed = JSON.parse(intervalsJson);
      if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number' && n > 0)) {
        return parsed;
      }
    } catch {
      // Invalid JSON, use defaults
    }
    return [5, 15, 30];
  }

  private async createRetryNotification(
    userId: UserId,
    originalNotification: any,
    retryCount: number
  ): Promise<void> {
    await this.notificationRepository.create(userId, {
      type: originalNotification.type,
      title: originalNotification.title,
      body: `Follow-up: ${originalNotification.body ?? ''}`,
      actionUrl: originalNotification.actionUrl,
      relatedEntityId: originalNotification.relatedEntityId,
      actionData: JSON.stringify({
        ...JSON.parse(originalNotification.actionData ?? '{}'),
        retryCount,
        originalNotificationId: originalNotification.id,
      }),
      scheduledFor: new Date(),
      status: NotificationStatus.PENDING,
    });
  }
}

export const notificationService = new NotificationService();
