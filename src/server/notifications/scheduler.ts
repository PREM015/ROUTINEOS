import prisma from '@/lib/prisma';
import type { NotificationType } from '@prisma/client';

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
 * Schedule habit reminders for tomorrow
 */
export async function scheduleHabitReminders(userId: string, date: string) {
  // Get habits with reminders enabled
  const habits = await prisma.habit.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      reminderEnabled: true,
      reminderTime: { not: null },
    },
  });

  const notifications = [];

  for (const habit of habits) {
    if (!habit.reminderTime) continue;

    const [hours, minutes] = habit.reminderTime.split(':').map(Number);
    if (hours === undefined || minutes === undefined) continue;
    const scheduledDate = new Date(date);
    scheduledDate.setHours(hours, minutes, 0, 0);

    notifications.push({
      userId,
      type: 'HABIT_REMINDER' as NotificationType,
      title: `Time for: ${habit.name}`,
      body: habit.description || 'Complete your habit',
      actionUrl: '/today',
      relatedEntityId: habit.id,
      scheduledFor: scheduledDate,
    });
  }

  // Bulk create
  if (notifications.length > 0) {
    await Promise.all(
      notifications.map(n => scheduleNotification(userId, n.type, n.scheduledFor, n))
    );
  }

  return notifications.length;
}