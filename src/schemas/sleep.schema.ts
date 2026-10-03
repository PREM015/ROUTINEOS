import { z } from 'zod';

/**
 * Canonical sleep-log schema. The dashboard /today flow posts
 * `actualBedtime` / `actualWakeTime` / `feltRested` (HH:mm times), so this
 * schema is the single source of truth for logging sleep. Legacy aliases that
 * other modules expect are exported from here as well.
 */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
/**
 * Hours 00–23, minutes 00–59.
 *
 * `^\d{2}:\d{2}$` also accepted `99:99`, which then flowed into
 * `calculateSleepDuration` and silently produced a nonsensical duration and
 * sleep score rather than a rejected write. `<input type="time">` can only emit
 * valid values, so this tightens the API boundary without changing any form.
 */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be a valid HH:mm between 00:00 and 23:59');
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