import { z } from 'zod';
export const NotificationSettingsSchema = z.object({
  notificationsEnabled: z.boolean(),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  dailyReminderTime: z.string().optional(),
});
