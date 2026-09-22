import { z } from 'zod';

const habitIdSchema = z.string().uuid('A valid habit ID is required');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const logHabitSchema = z.object({
  habitId: habitIdSchema,
  date: dateSchema,
  status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL']),
  completedAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  moodBefore: z.number().int().min(1).max(5).optional(),
  moodAfter: z.number().int().min(1).max(5).optional(),
  note: z.string().max(2000).optional(),
});

export const skipHabitSchema = z.object({
  date: dateSchema,
  reason: z.string().max(500, 'Reason must be 500 characters or less').optional(),
});

export const pauseHabitSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  reason: z.string().max(500).optional(),
});

export const resumeHabitSchema = z.object({
  date: dateSchema.optional(),
  reason: z.string().max(500).optional(),
});

export const bulkHabitSchema = z.object({
  habitIds: z
    .array(habitIdSchema)
    .min(1, 'At least one habit is required')
    .max(100, 'Cannot process more than 100 habits at once'),
  action: z.enum(['PAUSE', 'RESUME', 'ARCHIVE', 'ACTIVATE']),
  date: dateSchema.optional(),
  reason: z.string().max(500).optional(),
});

export const habitLogQuerySchema = z.object({
  habitId: habitIdSchema.optional(),
  status: z.array(z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL'])).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  sortBy: z.enum(['date', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const ratioSchema = z
  .number()
  .min(0, 'Value must be between 0 and 1')
  .max(1, 'Value must be between 0 and 1');

export const habitBatchSchema = z.object({
  logs: z
    .array(
      z.object({
        id: z.string().cuid().optional(),
        habitId: habitIdSchema,
        date: dateSchema,
        status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL']),
        completedAt: z.coerce.date().optional(),
        durationMinutes: z.number().int().positive().optional(),
        quantity: z.number().int().positive().optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        energyLevel: z.number().int().min(1).max(5).optional(),
        moodBefore: z.number().int().min(1).max(5).optional(),
        moodAfter: z.number().int().min(1).max(5).optional(),
        note: z.string().max(2000).optional(),
      })
    )
    .min(1, 'At least one log is required')
    .max(500, 'Cannot batch more than 500 logs at once'),
  deltaHours: z.number().int().min(-24).max(24).optional(),
  validateOnly: z.boolean().optional(),
});

export const habitStreakExportSchema = z.object({
  date: dateSchema,
  streakType: z.enum(['current', 'core', 'growth', 'minimum']).optional(),
});

export const importHabitAnalysisSchema = z.object({
  habitId: habitIdSchema,
  input: ratioSchema,
  output: ratioSchema,
  streakType: z.enum(['current', 'core', 'growth', 'minimum']).optional(),
});

export type LogHabitInput = z.infer<typeof logHabitSchema>;
export type SkipHabitInput = z.infer<typeof skipHabitSchema>;
export type PauseHabitInput = z.infer<typeof pauseHabitSchema>;
export type ResumeHabitInput = z.infer<typeof resumeHabitSchema>;
export type BulkHabitInput = z.infer<typeof bulkHabitSchema>;
export type HabitLogQueryParams = z.infer<typeof habitLogQuerySchema>;
export type BulkHabitLogInput = z.infer<typeof habitBatchSchema>;
export type HabitStreakExportInput = z.infer<typeof habitStreakExportSchema>;
export type ImportHabitAnalysisInput = z.infer<typeof importHabitAnalysisSchema>;