import { z } from 'zod';

/**
 * Template Validation Schemas
 * Validation for Template model inputs and queries
 */

const templateTypeValues = [
  'ROUTINE',
  'HABIT_SET',
  'GOAL_SET',
  'MORNING_ROUTINE',
  'EVENING_ROUTINE',
  'WORKOUT',
  'STUDY_SESSION',
  'CUSTOM',
] as const;

export const createTemplateSchema = z.object({
  type: z.enum(templateTypeValues),
  name: z
    .string()
    .min(1, 'Template name is required')
    .max(200, 'Template name must be 200 characters or less'),
  description: z
    .string()
    .max(2000, 'Description must be 2000 characters or less')
    .optional(),
  category: z
    .string()
    .max(100, 'Category must be 100 characters or less')
    .optional(),
  isPublic: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  content: z
    .string()
    .min(1, 'Template content is required')
    .max(100000, 'Template content is too large'),
  tags: z.array(z.string().max(50, 'Each tag must be 50 characters or less')).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const templateQuerySchema = z.object({
  type: z.enum(templateTypeValues).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  isFeatured: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const templateUseSchema = z.object({
  templateId: z.string().uuid(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type TemplateQueryParams = z.infer<typeof templateQuerySchema>;
export type TemplateUseInput = z.infer<typeof templateUseSchema>;