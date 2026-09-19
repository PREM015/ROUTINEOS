import { z } from 'zod';

/**
 * Feature Flag Schemas
 * Validation for feature flag administration and per-user toggles
 */

export const featureFlagKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, 'Flag keys must be URL-safe (letters, numbers, dashes)');

export const featureFlagRoleSchema = z.enum(['USER', 'ADMIN', 'MODERATOR']);

export const createFeatureFlagSchema = z.object({
  key: featureFlagKeySchema,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  isEnabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  enabledForUsers: z.array(z.string().min(1)).optional(),
  enabledForRoles: z.array(featureFlagRoleSchema).optional(),
});

export const updateFeatureFlagSchema = createFeatureFlagSchema
  .omit({ key: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update is required',
  });

export const toggleUserFlagSchema = z.object({
  key: featureFlagKeySchema,
  enabled: z.boolean(),
});

export const featureFlagQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;
export type ToggleUserFlagInput = z.infer<typeof toggleUserFlagSchema>;