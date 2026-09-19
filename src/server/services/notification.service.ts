import { NotificationType, NotificationStatus, type NotificationLog } from '@prisma/client';
import { z } from 'zod';
import { NotificationRepository } from '@/server/repositories/notification.repository';

/**
 * Notification Service
 * Business logic for user notifications (in-app, reminders, achievements)
 */

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
    input: CreateNotificationInput
  ): Promise<NotificationLog> {
    const parsed = createNotificationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        parsed.error.errors[0]?.message ?? 'Invalid notification data'
      );
    }

    return this.notificationRepository.create(userId, {
      type: parsed.data.type,
      relatedEntityId: parsed.data.relatedEntityId,
      title: parsed.data.title,
      body: parsed.data.body,
      actionUrl: parsed.data.actionUrl,
      actionData: parsed.data.actionData
        ? JSON.stringify(parsed.data.actionData)
        : undefined,
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
    query: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
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
  async markRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(
      userId,
      notificationId
    );
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
   * Delete a notification (ownership-checked)
   */
  async delete(
    userId: string,
    notificationId: string
  ): Promise<{ success: boolean }> {
    const existing = await this.notificationRepository.findById(
      userId,
      notificationId
    );
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
    goal: { id: string; title: string; dueDate?: Date | null; endDate?: Date | null }
  ): Promise<NotificationLog> {
    return this.createNotification(goal.id, {
      type: NotificationType.GOAL_DEADLINE,
      title: `Goal due: ${goal.title}`,
      body: (goal.dueDate ?? goal.endDate)
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
    habit: { id: string; name: string },
    scheduledFor: Date = new Date()
  ): Promise<NotificationLog> {
    return this.createNotification(habit.id, {
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
    achievement: { id: string; title: string },
    scheduledFor: Date = new Date()
  ): Promise<NotificationLog> {
    return this.createNotification(achievement.id, {
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: `Achievement unlocked: ${achievement.title}`,
      body: `You unlocked the "${achievement.title}" achievement. Keep it up!`,
      relatedEntityId: achievement.id,
      actionUrl: `/achievements/${achievement.id}`,
      scheduledFor,
    });
  }
}

export const notificationService = new NotificationService();