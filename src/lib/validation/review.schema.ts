import { z } from 'zod';
import { weeklyReviewSchema } from '@/schemas/weekly-review.schema';
import { MonthlyResetSchema } from '@/schemas/monthly-reset.schema';

export { weeklyReviewSchema, MonthlyResetSchema };

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
  habitsToKeep: z.array(z.string().uuid()).optional(),
  habitsToRemove: z.array(z.string().uuid()).optional(),
  habitsToModify: z
    .array(
      z.object({
        habitId: z.string().uuid(),
        changes: z.record(z.unknown()),
      })
    )
    .optional(),
  newHabitsToAdd: z
    .array(
      z.object({
        name: z.string().min(1, 'Habit name is required').max(100),
        tier: z.enum(['GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED']),
        frequencyType: z.enum(['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'YEARLY_TARGET', 'RANDOM', 'ONE_TIME', 'CUSTOM']),
      })
    )
    .optional(),
  goalsCompleted: z.array(z.string().uuid()).optional(),
  goalsInProgress: z.array(z.string().uuid()).optional(),
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