import { z } from 'zod';
import {
  createHabitSchema,
  updateHabitSchema,
  habitQuerySchema,
} from '@/schemas/habit.schema';

export { createHabitSchema, updateHabitSchema, habitQuerySchema };

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type HabitQueryParams = z.infer<typeof habitQuerySchema>;