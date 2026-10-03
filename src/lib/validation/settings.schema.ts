import { z } from 'zod';

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format');

/**
 * Accepts `SYSTEM` as a client-side alias for the `AUTO` enum member so the
 * theme toggle does not have to know about the database enum. `UserService`
 * normalises `SYSTEM` -> `AUTO` before persisting.
 */
const nullableTime = timeSchema.nullable().optional();

export const updateSettingsSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required').optional(),
  language: z.string().min(2).max(10).optional(),
  dateFormat: z.string().min(1).max(20).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  weekStartsOn: z.number().int().min(0, 'Week start must be between 0 and 6').max(6, 'Week start must be between 0 and 6').optional(),
  theme: z.enum(['LIGHT', 'DARK', 'AUTO', 'CUSTOM', 'SYSTEM']).optional(),
  customThemeColors: z.record(z.string()).optional(),
  soundEnabled: z.boolean().optional(),
  animationsEnabled: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  defaultView: z.string().max(50).optional(),
  showCompletedTasks: z.boolean().optional(),
  targetBedtime: nullableTime,
  targetWakeTime: nullableTime,
  minSleepDuration: z.number().int().min(60).max(720).optional(),
  sleepReminder: z.boolean().optional(),
  sleepReminderTime: nullableTime,
  sleepPreWarningEnabled: z.boolean().optional(),
  sleepPreWarningTime: nullableTime,
  autoStartSleepAfterMinutes: z.number().int().min(1).max(120).optional(),
  sleepAutoStartEnabled: z.boolean().optional(),
  sleepAutoStartAfterMinutes: z.number().int().min(1).max(120).optional(),
  wakeConfirmationEnabled: z.boolean().optional(),
  wakeConfirmationTime: nullableTime,
  weightNonNeg: z.number().min(0).max(10).optional(),
  weightGrowth: z.number().min(0).max(10).optional(),
  weightBonus: z.number().min(0).max(10).optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  quietHoursStart: nullableTime,
  quietHoursEnd: nullableTime,
  routineStartNotifications: z.boolean().optional(),
  upcomingRoutineNotifications: z.boolean().optional(),
  sleepReminderNotifications: z.boolean().optional(),
  sleepPreWarningNotifications: z.boolean().optional(),
  wakeConfirmationNotifications: z.boolean().optional(),
  habitReminderNotifications: z.boolean().optional(),
  goalReminderNotifications: z.boolean().optional(),
  advanceNotificationMinutes: z
    .number()
    .int()
    .min(0, 'Advance time cannot be negative')
    .max(1440, 'Advance time cannot exceed 24 hours')
    .optional(),
  dailyReminder: z.boolean().optional(),
  dailyReminderTime: nullableTime,
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