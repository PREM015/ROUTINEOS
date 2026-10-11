import { z } from 'zod';
import { weeklyReviewSchema } from '@/schemas/weekly-review.schema';
import { HABIT_TIERS_ORDERED } from '@/constants/habit-tiers';
import { HABIT_FREQUENCY_TYPES } from '@/constants/prisma-enums';

export { weeklyReviewSchema };

export const createWeeklyReviewSchema = weeklyReviewSchema;

export const weeklyReviewQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(['weekStart', 'createdAt', 'overallSatisfaction']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format');

export const createMonthlyResetSchema = z.object({
  month: monthSchema,
  monthHighlights: z.string().max(2000).optional(),
  monthChallenges: z.string().max(2000).optional(),
  habitsToKeep: z.array(z.string().cuid()).optional(),
  habitsToRemove: z.array(z.string().cuid()).optional(),
  habitsToModify: z
    .array(
      z.object({
        habitId: z.string().cuid(),
        changes: z.record(z.unknown()),
      })
    )
    .optional(),
  newHabitsToAdd: z
    .array(
      z.object({
        name: z.string().min(1, 'Habit name is required').max(100),
        // Derived from the canonical lists so the review flow accepts exactly
        // the tiers/frequencies the rest of the app does. These were hand-copied
        // and had already drifted (HabitTier was missing NON_NEGOTIABLE).
        tier: z.enum(
          HABIT_TIERS_ORDERED as [string, ...string[]]
        ) as z.ZodType<(typeof HABIT_TIERS_ORDERED)[number]>,
        frequencyType: z.enum(
          HABIT_FREQUENCY_TYPES as [string, ...string[]]
        ) as z.ZodType<(typeof HABIT_FREQUENCY_TYPES)[number]>,
      })
    )
    .optional(),
  goalsCompleted: z.array(z.string().cuid()).optional(),
  goalsInProgress: z.array(z.string().cuid()).optional(),
  /** Goals the user chose to drop; archived rather than completed. */
  goalsDropped: z.array(z.string().cuid()).optional(),
  goalsReviewNotes: z.string().max(2000).optional(),
  nextMonthPriorities: z.array(z.string().max(300)).optional(),
  nextMonthGoals: z
    .array(
      z.object({
        title: z.string().min(1, 'Goal title is required').max(200),
        targetValue: z.number().positive(),
        unit: z.string().optional(),
      })
    )
    .optional(),
  nextMonthFocus: z.string().max(500).optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  personalGrowth: z.number().int().min(1).max(5).optional(),
  goalProgress: z.number().int().min(1).max(5).optional(),
});

export const monthlyResetQuerySchema = z.object({
  month: monthSchema.optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>;
export type WeeklyReviewQueryParams = z.infer<typeof weeklyReviewQuerySchema>;
export type CreateMonthlyResetInput = z.infer<typeof createMonthlyResetSchema>;
export type MonthlyResetQueryParams = z.infer<typeof monthlyResetQuerySchema>;