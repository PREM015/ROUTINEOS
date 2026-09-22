import { z } from 'zod';

export const insightPeriodSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export const generateInsightSchema = z.object({
  period: insightPeriodSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  focus: z.string().max(500, 'Focus must be 500 characters or less').optional(),
});

export const aiInsightSchema = z.object({
  id: z.string().cuid(),
  period: insightPeriodSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().min(1, 'Summary is required'),
  wins: z.array(z.string()).optional(),
  patterns: z.array(z.string()).optional(),
  concerns: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
  nextPeriodFocus: z.string().optional(),
  predictions: z.record(z.string()).optional(),
  wasHelpful: z.boolean().optional(),
  userRating: z.number().int().min(1).max(5).optional(),
  userFeedback: z.string().max(2000).optional(),
  generatedAt: z.coerce.date(),
});

export const aiInsightQuerySchema = z.object({
  period: insightPeriodSchema.optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(['generatedAt', 'startDate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const insightFeedbackSchema = z.object({
  insightId: z.string().cuid(),
  wasHelpful: z.boolean(),
  userRating: z.number().int().min(1).max(5).optional(),
  userFeedback: z.string().max(2000).optional(),
});

export type GenerateInsightInput = z.infer<typeof generateInsightSchema>;
export type AIInsightInput = z.infer<typeof aiInsightSchema>;
export type AIInsightQueryParams = z.infer<typeof aiInsightQuerySchema>;
export type InsightFeedbackInput = z.infer<typeof insightFeedbackSchema>;