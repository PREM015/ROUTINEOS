import { z } from 'zod';
export const ReflectionSchema = z.object({
  date: z.string(),
  energyLevel: z.number().min(1).max(5),
  moodScore: z.number().min(1).max(5),
  biggestWin: z.string().optional(),
  biggestDifficulty: z.string().optional(),
  lessonsLearned: z.string().optional(),
  gratitude: z.string().optional(),
});
