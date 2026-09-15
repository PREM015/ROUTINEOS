import { z } from 'zod';
export const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  timezone: z.string().optional(),
  preferredLanguage: z.string().optional(),
});
