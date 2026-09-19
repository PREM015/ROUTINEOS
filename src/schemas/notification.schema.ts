import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
  notificationsEnabled: z.boolean(),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dailyReminder: z.boolean(),
  dailyReminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  habitReminders: z.boolean(),
  goalReminders: z.boolean(),
  weeklyReviewReminder: z.boolean(),
  monthlyResetReminder: z.boolean(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  deviceName: z.string().optional(),
  deviceType: z.enum(['WEB', 'MOBILE_IOS', 'MOBILE_ANDROID', 'TABLET', 'DESKTOP']).optional(),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;