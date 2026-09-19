import { z } from 'zod';

/**
 * Feedback Schemas
 * Validation for user-submitted feedback and admin triage
 */

export const feedbackTypeSchema = z.enum([
  'BUG',
  'FEATURE_REQUEST',
  'IMPROVEMENT',
  'QUESTION',
  'GENERAL',
  'COMPLAINT',
]);

export const feedbackStatusSchema = z.enum([
  'NEW',
  'IN_REVIEW',
  'PLANNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
  'WONT_FIX',
]);

export const createFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  email: z.string().email().optional(),
});

export const updateFeedbackSchema = createFeedbackSchema
  .omit({ email: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update is required',
  });

export const updateFeedbackStatusSchema = z.object({
  id: z.string().min(1),
  status: feedbackStatusSchema,
});

export const feedbackQuerySchema = z.object({
  type: feedbackTypeSchema.optional(),
  status: feedbackStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type UpdateFeedbackStatusInput = z.infer<typeof updateFeedbackStatusSchema>;
export type FeedbackQueryInput = z.infer<typeof feedbackQuerySchema>;