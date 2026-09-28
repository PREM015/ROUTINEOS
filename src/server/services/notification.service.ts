import { NotificationType, NotificationStatus, type NotificationLog } from '@/generated/prisma';
import { z } from 'zod';
import {
  NotificationRepository,
  type DeliveryChannels,
} from '@/server/repositories/notification.repository';
import { sendEmail } from '@/lib/email/sender';
import { renderSimpleHtml } from '@/lib/email/html';
import { pushService } from '@/server/services/push.service';

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

export class NotificationService {
  private notificationRepository: NotificationRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
  }

  /**
   * Create a notification for a user
   */
  async createNotification(
    userId: string,
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
    userId: string,
    query: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<NotificationLog[]> {
    return this.notificationRepository.findAll(userId, {
      unreadOnly: query.unreadOnly,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  /**
   * Get unread notification count for the badge
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.unreadCount(userId);
  }

  /**
   * Mark a single notification as read (ownership-checked)
   */
  async markRead(userId: string, notificationId: string): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    return this.notificationRepository.markRead(userId, notificationId);
  }

  /**
   * Mark all notifications as read; returns affected count
   */
  async markAllRead(userId: string): Promise<{ success: boolean; count: number }> {
    const count = await this.notificationRepository.markAllRead(userId);
    return { success: true, count };
  }

  /**
   * Dismiss a single notification (ownership-checked; idempotent).
   */
  async dismiss(userId: string, notificationId: string): Promise<NotificationLog> {
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
  async delete(userId: string, notificationId: string): Promise<{ success: boolean }> {
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
    userId: string,
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
    userId: string,
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
   * Notify the user that an achievement was unlocked
   */
  async notifyAchievement(
    userId: string,
    achievement: { id: string; title: string },
    scheduledFor: Date = new Date(),
  ): Promise<NotificationLog> {
    return this.createNotification(userId, {
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: `Achievement unlocked: ${achievement.title}`,
      body: `You unlocked the "${achievement.title}" achievement. Keep it up!`,
      relatedEntityId: achievement.id,
      actionUrl: `/achievements/${achievement.id}`,
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
      options.userId,
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
          notification.userId,
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
          notification.userId,
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
          const push = await pushService.sendToUser(notification.userId, {
            title: notification.title,
            body: notification.body ?? undefined,
            url: notification.actionUrl ?? undefined,
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
          notification.userId,
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
        notification.userId,
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
}

export const notificationService = new NotificationService();
