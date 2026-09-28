import type { NotificationLog, Prisma, NotificationType } from '@/generated/prisma';
import { NotificationStatus } from '@/generated/prisma';
import { BaseRepository } from './base.repository';

/**
 * Notification Repository
 * Database operations for NotificationLog model
 */

interface CreateNotificationData {
  type: NotificationType;
  relatedEntityId?: string;
  title: string;
  body?: string;
  actionUrl?: string;
  actionData?: string;
  scheduledFor: Date;
  sentAt?: Date;
  readAt?: Date;
  dismissedAt?: Date;
  status?: NotificationStatus;
  sentViaEmail?: boolean;
  sentViaPush?: boolean;
  sentViaSMS?: boolean;
  errorMessage?: string;
}

interface NotificationQueryParams {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Delivery channels a dispatched notification was actually sent through. */
export interface DeliveryChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

/**
 * A due notification joined with the recipient's channel preferences, so the
 * dispatcher can decide what to send without a second round trip per row.
 */
export interface DispatchCandidate {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  actionUrl: string | null;
  retryCount: number;
  user: {
    email: string | null;
    settings: {
      notificationsEnabled: boolean;
      emailNotifications: boolean;
      pushNotifications: boolean;
      smsNotifications: boolean;
    } | null;
  };
}

export class NotificationRepository extends BaseRepository {
  /**
   * Create a notification for a user
   */
  async create(userId: string, data: CreateNotificationData): Promise<NotificationLog> {
    try {
      return await this.prisma.notificationLog.create({
        data: {
          userId,
          type: data.type,
          relatedEntityId: data.relatedEntityId,
          title: data.title,
          body: data.body,
          actionUrl: data.actionUrl,
          actionData: data.actionData,
          scheduledFor: data.scheduledFor,
          sentAt: data.sentAt,
          readAt: data.readAt,
          dismissedAt: data.dismissedAt,
          status: data.status,
          sentViaEmail: data.sentViaEmail,
          sentViaPush: data.sentViaPush,
          sentViaSMS: data.sentViaSMS,
          errorMessage: data.errorMessage,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find notifications for a user with optional filters
   */
  async findAll(userId: string, query: NotificationQueryParams = {}): Promise<NotificationLog[]> {
    try {
      return await this.prisma.notificationLog.findMany({
        where: {
          userId,
          ...(query.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find a notification by ID with ownership check
   */
  async findById(userId: string, notificationId: string): Promise<NotificationLog | null> {
    try {
      return await this.prisma.notificationLog.findFirst({
        where: { id: notificationId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Mark a notification as read
   */
  async markRead(userId: string, notificationId: string): Promise<NotificationLog> {
    try {
      return await this.prisma.notificationLog.update({
        where: { id: notificationId, userId },
        data: {
          readAt: new Date(),
          status: NotificationStatus.READ,
        },
      });
    } catch (error) {
      this.handleError(error, 'markRead');
    }
  }

  /**
   * Mark all unread notifications as read
   */
  async markAllRead(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: { userId, readAt: null },
        data: {
          readAt: new Date(),
          status: NotificationStatus.READ,
        },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markAllRead');
    }
  }

  /**
   * Delete a notification owned by the user
   */
  async delete(userId: string, notificationId: string): Promise<NotificationLog> {
    try {
      return await this.prisma.notificationLog.delete({
        where: { id: notificationId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Count unread notifications for a user
   */
  async unreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notificationLog.count({
        where: { userId, readAt: null, dismissedAt: null },
      });
    } catch (error) {
      this.handleError(error, 'unreadCount');
    }
  }

  /**
   * Bulk create notifications
   */
  async createMany(data: Prisma.NotificationLogCreateManyInput[]): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.createMany({
        data,
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  /**
   * Count notifications of a type for a user scoped to a related entity
   * (used to dedupe per-day reminders).
   */
  async countByTypeAndRelatedId(
    userId: string,
    type: NotificationType,
    relatedEntityId: string,
  ): Promise<number> {
    try {
      return await this.prisma.notificationLog.count({
        where: { userId, type, relatedEntityId },
      });
    } catch (error) {
      this.handleError(error, 'countByTypeAndRelatedId');
    }
  }

  /**
   * Find pending (scheduled, not yet sent) notifications of given types.
   */
  async findPendingByType(userId: string, types: NotificationType[]): Promise<NotificationLog[]> {
    try {
      return await this.prisma.notificationLog.findMany({
        where: {
          userId,
          type: { in: types },
          status: NotificationStatus.PENDING,
        },
        orderBy: { scheduledFor: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findPendingByType');
    }
  }

  /**
   * Mark all pending notifications of a type as sent.
   */
  async markPendingByTypeSent(userId: string, type: NotificationType): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: { userId, type, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markPendingByTypeSent');
    }
  }

  /**
   * Mark a single pending notification as sent.
   *
   * Guarded on `status: PENDING`, so a concurrent dispatcher that already
   * claimed the row makes this a no-op instead of double-sending.
   */
  async markSent(
    userId: string,
    notificationId: string,
    channels?: Partial<DeliveryChannels>,
  ): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: {
          id: notificationId,
          userId,
          /**
           * Must accept PENDING **and** a retryable FAILED row.
           *
           * `findDueForDispatch` now re-selects FAILED rows that are still under
           * the retry budget. If this guard stayed `PENDING` only, such a row
           * would be re-pushed on every tick and never transition to SENT — an
           * unbounded duplicate loop, since the send happens before this call.
           */
          status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
        },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          ...(channels
            ? {
                sentViaEmail: channels.email ?? false,
                sentViaPush: channels.push ?? false,
                sentViaSMS: channels.sms ?? false,
              }
            : {}),
        },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markSent');
    }
  }

  /**
   * Claim every notification whose `scheduledFor` has arrived, joined with the
   * recipient's channel preferences.
   *
   * `excludeTypes` exists because `SLEEP_PROMPT` rows are delivered inline by
   * `SleepSessionService` against a different clock (bedtime/wake window, not
   * `scheduledFor`); letting the cron also pick them up would double-send.
   */
  async findDueForDispatch(
    before: Date,
    limit: number,
    excludeTypes: NotificationType[],
    /**
     * Restrict to a single user.
     *
     * The cron dispatcher passes nothing and processes the whole backlog. The
     * in-app catch-up in `GET /api/notifications` passes the signed-in user so
     * one person's page load cannot trigger a system-wide dispatch.
     */
    userId?: string,
    /** Rows in FAILED status below this retry count are re-selected. */
    maxRetries?: number,
  ): Promise<DispatchCandidate[]> {
    try {
      return await this.prisma.notificationLog.findMany({
        where: {
          scheduledFor: { lte: before },
          ...(userId ? { userId } : {}),
          ...(excludeTypes.length > 0 ? { type: { notIn: excludeTypes } } : {}),
          /**
           * A previous run selected only `status: PENDING`. Combined with
           * `markFailed` writing `status: FAILED`, that made a single transient
           * push error permanently lose the notification: the row was never
           * selected again, and `markFailed`'s own `retryCount < maxRetries`
           * guard could never fire because nothing re-selected the row.
           *
           * So FAILED rows are re-selected here while they are still under the
           * retry budget. Together with the guard in `markFailed` this gives a
           * real bounded retry instead of either unbounded retrying or no
           * retrying at all.
           */
          OR: [
            { status: NotificationStatus.PENDING },
            ...(maxRetries === undefined
              ? []
              : [{ status: NotificationStatus.FAILED, retryCount: { lt: maxRetries } }]),
          ],
        },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          actionUrl: true,
          retryCount: true,
          user: {
            select: {
              email: true,
              settings: {
                select: {
                  notificationsEnabled: true,
                  emailNotifications: true,
                  pushNotifications: true,
                  smsNotifications: true,
                  // These four were never selected, but
                  // `NotificationService.dispatchDueNotifications` reads them
                  // (via its `CategorySettings` cast) to honour the per-category
                  // opt-outs a user sets in Settings > Notifications. They were
                  // therefore always `undefined` and every category toggle was
                  // silently ignored — a user who turned off habit reminders
                  // kept getting them. Prisma returns only selected columns, so
                  // the cast could not save this.
                  habitReminders: true,
                  goalReminders: true,
                  routineStartNotifications: true,
                  sleepReminderNotifications: true,
                },
              },
            },
          },
        },
        orderBy: { scheduledFor: 'asc' },
        take: limit,
      });
    } catch (error) {
      this.handleError(error, 'findDueForDispatch');
    }
  }

  /**
   * Record a delivery failure and bump `retryCount`.
   *
   * Gives up permanently once `maxRetries` is reached so a permanently
   * undeliverable row (bad address, revoked VAPID subscription) does not
   * accumulate retry attempts forever.
   */
  async markFailed(
    userId: string,
    notificationId: string,
    errorMessage: string,
    maxRetries = 3,
  ): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: {
          id: notificationId,
          userId,
          // Accepts PENDING or a retryable FAILED row, matching `markSent`.
          status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
          retryCount: { lt: maxRetries },
        },
        data: {
          status: NotificationStatus.FAILED,
          errorMessage: errorMessage.slice(0, 1000),
          retryCount: { increment: 1 },
        },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markFailed');
    }
  }

  /**
   * Dismiss a single pending notification (idempotent no-op if not pending).
   */
  async markDismissed(userId: string, notificationId: string): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: { id: notificationId, userId },
        data: { status: NotificationStatus.DISMISSED, dismissedAt: new Date() },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markDismissed');
    }
  }

  /**
   * Dismiss all pending notifications of a type.
   */
  async dismissPendingByType(userId: string, type: NotificationType): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: { userId, type, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.DISMISSED, dismissedAt: new Date() },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'dismissPendingByType');
    }
  }
}
