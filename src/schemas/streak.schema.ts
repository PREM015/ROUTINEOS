import { z } from 'zod';
// Minimal schema - auto calculated mostly
export const StreakSchema = z.object({
  id: z.string(),
});
