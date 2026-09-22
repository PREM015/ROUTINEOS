import { z } from 'zod';
import { createGoalSchema, updateGoalSchema } from '@/schemas/goal.schema';

export { createGoalSchema, updateGoalSchema };

export const goalQuerySchema = z.object({
  status: z.array(z.enum(['ACTIVE', 'COMPLETED', 'MISSED', 'CARRIED_OVER', 'ON_HOLD', 'CANCELLED'])).optional(),
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).optional(),
  priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'PERSONAL', 'ACADEMIC', 'NON_PROFIT', 'PROFESSIONAL'])).optional(),
  projectId: z.string().cuid().optional(),
  parentGoalId: z.string().cuid().nullable().optional(),
  search: z.string().optional(),
  startDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(['title', 'createdAt', 'endDate', 'priority', 'progress', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type GoalQueryParams = z.infer<typeof goalQuerySchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;