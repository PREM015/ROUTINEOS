import { z } from 'zod';

export const weeklyReviewSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answers: z.record(z.string()),
  biggestWins: z.string().max(1000).optional(),
  challenges: z.string().max(1000).optional(),
  lessonsLearned: z.string().max(1000).optional(),
  nextWeekFocus: z.string().max(500).optional(),
  nextWeekGoals: z.array(z.string()).optional(),
  overallSatisfaction: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  stressLevel: z.number().int().min(1).max(5).optional(),
});

export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>;