import { z } from 'zod';

export const streakSchema = z.object({
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  coreStreak: z.number().int().min(0),
  growthStreak: z.number().int().min(0),
  minimumDayStreak: z.number().int().min(0),
  streakStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lastCompletedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const streakMilestoneSchema = z.object({
  milestoneDays: z.number().int().positive(),
  streakType: z.enum(['current', 'core', 'growth', 'minimum']),
  reachedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  celebrated: z.boolean().optional(),
});

export type StreakInput = z.infer<typeof streakSchema>;
export type StreakMilestoneInput = z.infer<typeof streakMilestoneSchema>;