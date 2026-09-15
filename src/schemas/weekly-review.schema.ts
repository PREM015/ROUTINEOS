import { z } from 'zod';
export const WeeklyReviewSchema = z.object({
  weekStart: z.string(),
  answers: z.object({
    workedWell: z.string().optional(),
    didntWork: z.string().optional(),
    biggestWin: z.string().optional(),
    biggestDifficulty: z.string().optional(),
    shouldChange: z.string().optional(),
    nextWeekFocus: z.string().optional(),
  }),
});
