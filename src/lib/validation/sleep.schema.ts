import { z } from 'zod';
import { LogSleepSchema, logSleepSchema } from '@/schemas/sleep.schema';

export { LogSleepSchema, logSleepSchema };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format');

export const updateSleepLogSchema = logSleepSchema.partial();

export const updateSleepScheduleSchema = z.object({
  targetBedtime: timeSchema.optional(),
  targetWakeTime: timeSchema.optional(),
  minSleepDuration: z.number().int().min(60, 'Minimum sleep duration must be at least 60 minutes').max(720).optional(),
  sleepReminder: z.boolean().optional(),
  sleepReminderTime: timeSchema.optional(),
});

export const sleepQuerySchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  feltRested: z.boolean().optional(),
  sortBy: z.enum(['date', 'createdAt', 'quality', 'actualDurationMinutes']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type LogSleepInput = z.infer<typeof logSleepSchema>;
export type UpdateSleepLogInput = z.infer<typeof updateSleepLogSchema>;
export type UpdateSleepScheduleInput = z.infer<typeof updateSleepScheduleSchema>;
export type SleepQueryParams = z.infer<typeof sleepQuerySchema>;