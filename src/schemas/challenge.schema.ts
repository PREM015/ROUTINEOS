import { z } from 'zod';

/**
 * Challenge Schemas
 * Validation for challenge creation, joining, and progress updates
 */

export const createChallengeSchema = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(5000),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isPublic: z.boolean().optional().default(true),
    maxMembers: z.number().int().min(1).max(10000).optional(),
    rules: z.string().max(5000).optional(),
    rewards: z.string().max(5000).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const updateChallengeProgressSchema = z.object({
  progress: z.number().min(0).max(100),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeProgressInput = z.infer<typeof updateChallengeProgressSchema>;