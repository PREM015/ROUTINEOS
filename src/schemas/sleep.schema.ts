import { z } from 'zod';
export const LogSleepSchema = z.object({
  date: z.string(),
  bedtime: z.string(),
  wakeTime: z.string(),
  quality: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
});
