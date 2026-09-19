import { z } from 'zod';

const entityTypeSchema = z.enum([
  'habit',
  'goal',
  'project',
  'task',
  'journal',
  'reflection',
  'mood',
  'sleep',
  'routine',
  'tag',
  'category',
  'all',
]);

export const globalSearchSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(100, 'Search query must be 100 characters or less')
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, 'Search query is required'),
  type: entityTypeSchema.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export const advancedSearchSchema = globalSearchSchema;

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;
export type AdvancedSearchInput = z.infer<typeof advancedSearchSchema>;