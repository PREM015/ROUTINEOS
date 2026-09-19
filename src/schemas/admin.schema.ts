import { z } from 'zod';

/**
 * Admin Schemas
 * Validation for admin-only management operations
 */

export const adminRoleSchema = z.enum(['USER', 'ADMIN', 'MODERATOR']);

export const updateUserAdminSchema = z
  .object({
    role: adminRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update is required',
  });

export const adminAnalyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;
export type AdminAnalyticsQueryInput = z.infer<typeof adminAnalyticsQuerySchema>;