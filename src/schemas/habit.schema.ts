import { z } from 'zod';
import { optionalNullableDateSchema } from '@/schemas/focus.schema';

/**
 * Habit Validation Schemas
 *
 * Note on clearing fields: a plain `z.object()` *strips* unknown keys, and
 * `JSON.stringify` drops `undefined` values. So a UI that sends
 * `{ description: undefined }` to mean "clear this" never reaches the server at
 * all. Every field the Edit modal can empty is therefore declared
 * `.nullable()` here, and the UI sends `null` instead of `undefined`.
 */

export const createHabitSchema = z.object({
  name: z
    .string()
    .min(1, 'Habit name is required')
    .max(100, 'Habit name must be 100 characters or less'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .nullable()
    .optional(),
  tier: z.enum(['NON_NEGOTIABLE', 'GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'] as const),
  categoryId: z.string().cuid().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
  icon: z.string().nullable().optional(),
  frequencyType: z.enum(['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'YEARLY_TARGET', 'RANDOM', 'ONE_TIME', 'CUSTOM'] as const),
  // Nullable so switching frequencyType away from SPECIFIC_WEEKDAYS can clear
  // the stored "1,3,5" list. Left set, that stale value crashed the Schedule tab
  // (it JSON.parse()d a comma-joined string).
  frequencyValue: z.string().nullable().optional(),
  targetCount: z.number().int().positive().nullable().optional(),
  startDate: optionalNullableDateSchema,
  endDate: optionalNullableDateSchema,
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  points: z.number().positive().optional(),
  estimatedDuration: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  isPublic: z.boolean().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
  appliesEveryDay: z.boolean().optional(),
  dayTypeIds: z.array(z.string().cuid()).optional(),
});

export const updateHabitSchema = createHabitSchema.partial().extend({
  // `status` is set by the pause/resume/archive actions and by the Edit modal's
  // Status select. It must be declared here or `z.object` strips it and the
  // change silently reverts.
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED'] as const).optional(),
});

export const logHabitSchema = z.object({
  habitId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL'] as const),
  // Optional AND nullable. `z.coerce.date().optional()` would turn an explicit
  // `null` (un-checking a habit) into 1970-01-01 and persist that, because
  // `new Date(null)` is a valid date.
  completedAt: optionalNullableDateSchema,
  durationMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  moodBefore: z.number().int().min(1).max(5).optional(),
  moodAfter: z.number().int().min(1).max(5).optional(),
  note: z.string().nullable().optional(),
});

export const habitQuerySchema = z.object({
  status: z.array(z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED', 'DRAFT'] as const)).optional(),
  // Includes NON_NEGOTIABLE, which both habit modals offer. It was missing here,
  // so `GET /api/habits?tier=NON_NEGOTIABLE` returned 400.
  tier: z.array(z.enum(['NON_NEGOTIABLE', 'GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'] as const)).optional(),
  categoryId: z.string().cuid().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'streak', 'completionRate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includeArchived: z.boolean().optional(),
  dayTypeId: z.string().cuid().optional(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type LogHabitInput = z.infer<typeof logHabitSchema>;
export type HabitQueryParams = z.infer<typeof habitQuerySchema>;