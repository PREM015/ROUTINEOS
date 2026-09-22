import type { NotificationLog, Prisma, NotificationType } from '@prisma/client';
import { NotificationStatus } from '@prisma/client';
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

export class NotificationRepository extends BaseRepository {
  /**
   * Create a notification for a user
   */
  async create(
    userId: string,
    data: CreateNotificationData
  ): Promise<NotificationLog> {
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
  async findAll(
    userId: string,
    query: NotificationQueryParams = {}
  ): Promise<NotificationLog[]> {
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
  async findById(
    userId: string,
    notificationId: string
  ): Promise<NotificationLog | null> {
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
  async markRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationLog> {
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
  async delete(
    userId: string,
    notificationId: string
  ): Promise<NotificationLog> {
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
  async createMany(
    data: Prisma.NotificationLogCreateManyInput[]
  ): Promise<number> {
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
    relatedEntityId: string
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
  async findPendingByType(
    userId: string,
    types: NotificationType[]
  ): Promise<NotificationLog[]> {
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
  async markPendingByTypeSent(
    userId: string,
    type: NotificationType
  ): Promise<number> {
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
   */
  async markSent(
    userId: string,
    notificationId: string
  ): Promise<number> {
    try {
      const result = await this.prisma.notificationLog.updateMany({
        where: { id: notificationId, userId, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'markSent');
    }
  }

  /**
   * Dismiss a single pending notification (idempotent no-op if not pending).
   */
  async markDismissed(
    userId: string,
    notificationId: string
  ): Promise<number> {
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
  async dismissPendingByType(
    userId: string,
    type: NotificationType
  ): Promise<number> {
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