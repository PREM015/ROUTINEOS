import { z } from 'zod';

export const createJournalEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less').optional(),
  content: z.string().min(1, 'Content is required').max(10000, 'Content must be 10000 characters or less'),
  mood: z.number().int().min(1, 'Mood must be between 1 and 5').max(5, 'Mood must be between 1 and 5').optional(),
  energy: z.number().int().min(1, 'Energy must be between 1 and 5').max(5, 'Energy must be between 1 and 5').optional(),
  gratitude: z.array(z.string().max(500, 'Each gratitude item must be 500 characters or less')).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const updateJournalEntrySchema = createJournalEntrySchema.partial();

export const journalEntryQuerySchema = z.object({
  search: z.string().optional(),
  mood: z.number().int().min(1).max(5).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(['date', 'createdAt', 'title', 'mood']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  tagId: z.string().uuid().optional(),
});

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;
export type JournalEntryQueryParams = z.infer<typeof journalEntryQuerySchema>;
