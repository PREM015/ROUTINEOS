import { z } from 'zod';

/**
 * Canonical sleep-log schema. The dashboard /today flow posts
 * `actualBedtime` / `actualWakeTime` / `feltRested` (HH:mm times), so this
 * schema is the single source of truth for logging sleep. Legacy aliases that
 * other modules expect are exported from here as well.
 */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format');
const ratingSchema = z.number().int().min(1, 'Value must be between 1 and 5').max(5, 'Value must be between 1 and 5');

export const LogSleepSchema = z.object({
  date: dateSchema,
  targetBedtime: timeSchema.optional(),
  targetWakeTime: timeSchema.optional(),
  actualBedtime: timeSchema,
  actualWakeTime: timeSchema,
  quality: ratingSchema.optional(),
  wakeUpCount: z.number().int().min(0).optional(),
  feltRested: z.boolean().optional(),
  moodOnWaking: ratingSchema.optional(),
  energyOnWaking: ratingSchema.optional(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
});

export const logSleepSchema = LogSleepSchema;

export type LogSleepInput = z.infer<typeof LogSleepSchema>;