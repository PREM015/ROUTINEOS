import { z } from 'zod';
import { HabitTier, HabitFrequencyType, HabitStatus } from '@prisma/client';

/**
 * Habit Validation Schemas
 */

export const createHabitSchema = z.object({
  name: z
    .string()
    .min(1, 'Habit name is required')
    .max(100, 'Habit name must be 100 characters or less'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  tier: z.enum(['GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'] as const),
  categoryId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  icon: z.string().optional(),
  frequencyType: z.enum(['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'YEARLY_TARGET', 'RANDOM', 'ONE_TIME', 'CUSTOM'] as const),
  frequencyValue: z.string().optional(),
  targetCount: z.number().int().positive().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reminderEnabled: z.boolean().optional(),
  points: z.number().positive().optional(),
  estimatedDuration: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  isPublic: z.boolean().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const updateHabitSchema = createHabitSchema.partial();

export const logHabitSchema = z.object({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL'] as const),
  completedAt: z.coerce.date().optional(),
  durationMinutes: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  moodBefore: z.number().int().min(1).max(5).optional(),
  moodAfter: z.number().int().min(1).max(5).optional(),
  note: z.string().optional(),
});

export const habitQuerySchema = z.object({
  status: z.array(z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED', 'DRAFT'] as const)).optional(),
  tier: z.array(z.enum(['GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'] as const)).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'streak', 'completionRate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includeArchived: z.boolean().optional(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type LogHabitInput = z.infer<typeof logHabitSchema>;
export type HabitQueryParams = z.infer<typeof habitQuerySchema>;