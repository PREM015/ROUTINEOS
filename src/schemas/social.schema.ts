import { z } from 'zod';

/**
 * Social Schemas
 * Validation for follow/unfollow and connection listing
 */

export const socialUserIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value !== 'me', {
    message: 'userId must be a concrete user id, not a placeholder',
  });

export const followUserSchema = z.object({
  userId: socialUserIdSchema,
});

export const socialQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type FollowUserInput = z.infer<typeof followUserSchema>;
export type SocialQueryInput = z.infer<typeof socialQuerySchema>;