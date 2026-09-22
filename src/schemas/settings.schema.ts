import { z } from 'zod';
export const UpdateSettingsSchema = z.object({
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  timezone: z.string().optional(),
  weekStartsOn: z.number().optional(),
  dailyReminderTime: z.string().optional(),
  autoStartSleepAfterMinutes: z.number().int().min(1).max(120).optional(),
  sleepAutoStartEnabled: z.boolean().optional(),
  sleepAutoStartAfterMinutes: z.number().int().min(1).max(120).optional(),
});
