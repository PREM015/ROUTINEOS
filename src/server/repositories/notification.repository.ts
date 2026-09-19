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
}