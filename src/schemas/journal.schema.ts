import { z } from 'zod';
import { JOURNAL_RATINGS } from '@/constants/journal';

/**
 * Journal request schemas.
 *
 * Every route validates through this file so the HTTP layer and the service
 * cannot disagree about what a valid journal request is. The important detail
 * is the split between `create` and `update`: a PATCH is a *partial* update
 * whose absent fields mean "leave alone" and whose `null` fields mean "clear".
 * Those are different intents and one shared object cannot express both, which
 * is why `updateJournalEntrySchema` is written out rather than derived with
 * `.partial()`.
 */

export const JOURNAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const JOURNAL_MONTH_PATTERN = /^\d{4}-\d{2}$/;

export const journalDateSchema = z
  .string()
  .regex(JOURNAL_DATE_PATTERN, 'Date must be in YYYY-MM-DD format');

export const journalMonthSchema = z
  .string()
  .regex(JOURNAL_MONTH_PATTERN, 'Month must be in YYYY-MM format')
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    return month >= 1 && month <= 12;
  }, 'Month must be between 01 and 12');

const ratingSchema = z
  .number()
  .int('Rating must be a whole number')
  .min(1, 'Rating must be between 1 and 5')
  .max(5, 'Rating must be between 1 and 5')
  .refine((value) => (JOURNAL_RATINGS as readonly number[]).includes(value), {
    message: 'Rating must be between 1 and 5',
  });

const gratitudeItemSchema = z.string().max(500, 'Each gratitude item must be 500 characters or less');

export const createJournalEntrySchema = z.object({
  date: journalDateSchema,
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .optional(),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Content must be 10000 characters or less'),
  mood: ratingSchema.optional(),
  energy: ratingSchema.optional(),
  gratitude: z.array(gratitudeItemSchema).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
});

/**
 * PATCH body.
 *
 * `.nullable()` on title/mood/energy/gratitude fixes a silent data bug: the
 * editor used to build its payload with `...(mood !== null ? { mood } : {})`, so
 * clearing a rating dropped the key entirely, the service read that as "no
 * change", and the old value stayed. `null` now means clear while omitting the
 * key still means leave-alone, so the two are finally distinguishable.
 *
 * `title` accepts an empty string as well as `null`, because an `Input` reports
 * a cleared field as `''` and `null` is not the only thing a client can send.
 *
 * `date` is intentionally absent. `JournalEntry` is `@@unique([userId, date])`,
 * so accepting a date change here surfaced as a raw Prisma P2002 from the middle
 * of an update. Re-dating an entry is a different operation from editing it and
 * nothing in the UI offers it.
 */
export const updateJournalEntrySchema = z.object({
  title: z.string().max(200, 'Title must be 200 characters or less').nullable().optional(),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(10000, 'Content must be 10000 characters or less')
    .optional(),
  mood: ratingSchema.nullable().optional(),
  energy: ratingSchema.nullable().optional(),
  gratitude: z.array(gratitudeItemSchema).nullable().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
});

export const journalEntryIdSchema = z.object({
  id: z.string().min(1, 'Entry id is required'),
});

export const journalRevisionIdSchema = z.object({
  id: z.string().min(1, 'Entry id is required'),
  revisionId: z.string().min(1, 'Revision id is required'),
});

export const setJournalTagsSchema = z.object({
  tagIds: z.array(z.string().cuid()).max(50, 'An entry can carry at most 50 tags'),
});

export const deletedJournalQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const journalEntryQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  mood: z.coerce.number().int().min(1).max(5).optional(),
  isFavorite: z.coerce.boolean().optional(),
  isArchived: z.coerce.boolean().optional(),
  startDate: journalDateSchema.optional(),
  endDate: journalDateSchema.optional(),
  month: journalMonthSchema.optional(),
  date: journalDateSchema.optional(),
  sortBy: z.enum(['date', 'createdAt', 'title', 'mood']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  tagId: z.string().cuid().optional(),
});

export const journalExportQuerySchema = z.object({
  format: z.enum(['markdown', 'json']).default('markdown'),
  search: z.string().trim().min(1).max(200).optional(),
  mood: z.coerce.number().int().min(1).max(5).optional(),
  isFavorite: z.coerce.boolean().optional(),
  isArchived: z.coerce.boolean().optional(),
  startDate: journalDateSchema.optional(),
  endDate: journalDateSchema.optional(),
  month: journalMonthSchema.optional(),
  date: journalDateSchema.optional(),
  tagId: z.string().cuid().optional(),
  sortBy: z.enum(['date', 'createdAt', 'title', 'mood']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/** Default page size for `GET /api/journal` when the caller does not ask. */
export const DEFAULT_JOURNAL_PAGE_SIZE = 20;

/**
 * Hard ceiling on one page of entries.
 *
 * `BaseRepository.buildPaginationQuery` silently caps `take` at 100, which used
 * to be the *only* limit: the page requested 100 and then paginated those 100 in
 * the browser, so an entry 240 days back was unreachable. Page size now derives
 * from an offset the client controls, and this ceiling exists so one request
 * cannot ask for the whole table.
 */
export const MAX_JOURNAL_PAGE_SIZE = 100;

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type UpdateJournalEntryInput = z.infer<typeof updateJournalEntrySchema>;
export type JournalEntryQueryParams = z.infer<typeof journalEntryQuerySchema>;
export type JournalExportQueryParams = z.infer<typeof journalExportQuerySchema>;
export type DeletedJournalQueryParams = z.infer<typeof deletedJournalQuerySchema>;
