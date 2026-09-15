import { z } from 'zod';
export const MonthlyResetSchema = z.object({
  month: z.number(),
  year: z.number(),
  habitsToKeep: z.array(z.string()),
  habitsToRemove: z.array(z.string()),
  habitsToModify: z.array(z.string()),
  newGoals: z.array(z.any()), // simplified
  carryOverGoals: z.array(z.string()),
});
