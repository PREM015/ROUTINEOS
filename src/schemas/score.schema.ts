import { z } from 'zod';

export const calculateScoreSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  isMinimumDay: z.boolean().optional(),
  minimumDayTemplateId: z.string().cuid().optional(),
  minimumDayReason: z.string().max(1000).optional(),
  isRestDay: z.boolean().optional(),
  restDayReason: z.string().max(1000).optional(),
  contextTags: z.array(z.string().max(100)).optional(),
});

export const activateMinimumDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  templateId: z.string().cuid().optional(),
  reason: z.string().max(1000).optional(),
});

export const activateRestDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional(),
});

export const updateScoreSettingsSchema = z.object({
  weightNonNeg: z.number().min(0).max(10, 'Weight must be at most 10').optional(),
  weightGrowth: z.number().min(0).max(10, 'Weight must be at most 10').optional(),
  weightBonus: z.number().min(0).max(10, 'Weight must be at most 10').optional(),
});

export const scoreQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  grade: z.string().max(2).optional(),
  isMinimumDay: z.boolean().optional(),
  isRestDay: z.boolean().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CalculateScoreInput = z.infer<typeof calculateScoreSchema>;
export type ActivateMinimumDayInput = z.infer<typeof activateMinimumDaySchema>;
export type ActivateRestDayInput = z.infer<typeof activateRestDaySchema>;
export type UpdateScoreSettingsInput = z.infer<typeof updateScoreSettingsSchema>;
export type ScoreQueryParams = z.infer<typeof scoreQuerySchema>;