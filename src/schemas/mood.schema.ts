import { z } from 'zod';

export const logMoodSchema = z.object({
  mood: z.number().int().min(1, 'Mood must be between 1 and 5').max(5, 'Mood must be between 1 and 5'),
  energy: z.number().int().min(1, 'Energy must be between 1 and 5').max(5, 'Energy must be between 1 and 5').optional(),
  stress: z.number().int().min(1, 'Stress must be between 1 and 5').max(5, 'Stress must be between 1 and 5').optional(),
  anxiety: z.number().int().min(1, 'Anxiety must be between 1 and 5').max(5, 'Anxiety must be between 1 and 5').optional(),
  focus: z.number().int().min(1, 'Focus must be between 1 and 5').max(5, 'Focus must be between 1 and 5').optional(),
  triggers: z.array(z.string().max(100, 'Each trigger must be 100 characters or less')).optional(),
  activities: z.array(z.string().max(100, 'Each activity must be 100 characters or less')).optional(),
  location: z.string().max(200, 'Location must be 200 characters or less').optional(),
  weather: z.string().max(50, 'Weather must be 50 characters or less').optional(),
  notes: z.string().max(2000, 'Notes must be 2000 characters or less').optional(),
  timestamp: z.coerce.date().optional(),
});

export const updateMoodSchema = logMoodSchema.partial();

export const moodQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  sortBy: z.enum(['timestamp', 'mood', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type LogMoodInput = z.infer<typeof logMoodSchema>;
export type UpdateMoodInput = z.infer<typeof updateMoodSchema>;
export type MoodQueryParams = z.infer<typeof moodQuerySchema>;
