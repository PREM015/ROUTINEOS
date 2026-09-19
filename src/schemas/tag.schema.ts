import { z } from 'zod';

/**
 * Tag Validation Schemas
 * Validation for Tag model inputs
 */

export const createTagSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(50, 'Tag name must be 50 characters or less'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex value like #FF00AA')
    .optional(),
  icon: z.string().max(20, 'Icon must be 20 characters or less').optional(),
});

export const updateTagSchema = createTagSchema.partial();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;