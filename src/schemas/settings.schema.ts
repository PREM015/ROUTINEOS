import { z } from 'zod';
export const UpdateSettingsSchema = z.object({
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  timezone: z.string().optional(),
  weekStartsOn: z.number().optional(),
  dailyReminderTime: z.string().optional(),
});
