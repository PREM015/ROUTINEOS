import { z } from 'zod';

export const reflectionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  energy: z.number().int().min(1).max(5).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  stress: z.number().int().min(1).max(5).optional(),
  focus: z.number().int().min(1).max(5).optional(),
  reflectionText: z.string().max(2000).optional(),
  biggestWin: z.string().max(500).optional(),
  biggestDifficulty: z.string().max(500).optional(),
  lessonsLearned: z.string().max(1000).optional(),
  gratitude: z.string().max(500).optional(),
  improvements: z.string().max(1000).optional(),
  tomorrowFocus: z.string().max(500).optional(),
  tomorrowPriorities: z.array(z.string()).optional(),
});

export type ReflectionInput = z.infer<typeof reflectionSchema>;