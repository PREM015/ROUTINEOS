import { z } from 'zod';
import { UpdateSettingsSchema } from '@/schemas/settings.schema';

export { UpdateSettingsSchema };

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format');

export const updateSettingsSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required').optional(),
  language: z.string().min(2).max(10).optional(),
  dateFormat: z.string().min(1).max(20).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  weekStartsOn: z.number().int().min(0, 'Week start must be between 0 and 6').max(6, 'Week start must be between 0 and 6').optional(),
  theme: z.enum(['LIGHT', 'DARK', 'AUTO', 'CUSTOM']).optional(),
  customThemeColors: z.record(z.string()).optional(),
  soundEnabled: z.boolean().optional(),
  animationsEnabled: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  defaultView: z.string().max(50).optional(),
  showCompletedTasks: z.boolean().optional(),
  targetBedtime: timeSchema.optional(),
  targetWakeTime: timeSchema.optional(),
  minSleepDuration: z.number().int().min(60).max(720).optional(),
  sleepReminder: z.boolean().optional(),
  sleepReminderTime: timeSchema.optional(),
  weightNonNeg: z.number().min(0).max(10).optional(),
  weightGrowth: z.number().min(0).max(10).optional(),
  weightBonus: z.number().min(0).max(10).optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  quietHoursStart: timeSchema.optional(),
  quietHoursEnd: timeSchema.optional(),
  dailyReminder: z.boolean().optional(),
  dailyReminderTime: timeSchema.optional(),
  habitReminders: z.boolean().optional(),
  goalReminders: z.boolean().optional(),
  weeklyReviewReminder: z.boolean().optional(),
  monthlyResetReminder: z.boolean().optional(),
  focusReminders: z.boolean().optional(),
  breakReminders: z.boolean().optional(),
  retroactiveEditDays: z.number().int().min(0).max(30).optional(),
  autoArchiveCompletedDays: z.number().int().min(0).max(365).optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
  profilePublic: z.boolean().optional(),
  shareStats: z.boolean().optional(),
  aiInsightsEnabled: z.boolean().optional(),
  experimentalFeatures: z.boolean().optional(),
});

export const settingsQuerySchema = z.object({
  fields: z.array(z.string()).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type SettingsQueryParams = z.infer<typeof settingsQuerySchema>;