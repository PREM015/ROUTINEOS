import { z } from 'zod';
import { reflectionSchema } from '@/schemas/reflection.schema';

export { reflectionSchema };

export const dailyReflectionSchema = reflectionSchema;

export const reflectionQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  hasWriting: z.boolean().optional(),
  sortBy: z.enum(['date', 'createdAt', 'mood', 'energy']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type ReflectionInput = z.infer<typeof reflectionSchema>;
export type DailyReflectionInput = z.infer<typeof dailyReflectionSchema>;
export type ReflectionQueryParams = z.infer<typeof reflectionQuerySchema>;