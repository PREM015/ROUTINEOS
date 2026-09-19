import { z } from 'zod';

/**
 * Achievement Schemas
 * Validation for achievement unlock evaluation and milestone celebration
 */

export const celebrateAchievementSchema = z
  .object({
    milestoneId: z.string().min(1).optional(),
    achievementId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.milestoneId || data.achievementId), {
    message: 'milestoneId or achievementId is required',
  });

export type CelebrateAchievementInput = z.infer<typeof celebrateAchievementSchema>;