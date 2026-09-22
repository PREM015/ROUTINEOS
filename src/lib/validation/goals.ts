import { z } from 'zod';

export const goalProgressSchema = z.object({
  goalId: z.string().uuid('A valid goal ID is required'),
  value: z.number().min(0, 'Progress value must be 0 or greater'),
  note: z.string().max(2000, 'Note must be 2000 characters or less').optional(),
  date: z.coerce.date().optional(),
});

export const goalCarryOverSchema = z.object({
  goalIds: z
    .array(z.string().cuid())
    .min(1, 'At least one goal must be selected to carry over'),
  reTarget: z
    .object({
      targetValue: z.number().positive('Target value must be positive'),
      endDate: z.coerce.date(),
    })
    .optional(),
});

export const goalVelocityQuerySchema = z.object({
  goalId: z.string().cuid().optional(),
  days: z.number().int().min(7, 'Velocity window must be at least 7 days').max(365, 'Velocity window must be at most 365 days').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const goalStatusSchema = z.object({
  goalId: z.string().cuid(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'MISSED', 'CARRIED_OVER', 'ON_HOLD', 'CANCELLED']),
});

export const milestoneInputSchema = z.object({
  title: z.string().min(1, 'Milestone title is required').max(200),
  description: z.string().max(2000).optional(),
  targetValue: z.number().positive().optional(),
  dueDate: z.coerce.date().optional(),
});

export type GoalProgressInput = z.infer<typeof goalProgressSchema>;
export type GoalCarryOverInput = z.infer<typeof goalCarryOverSchema>;
export type GoalVelocityQueryParams = z.infer<typeof goalVelocityQuerySchema>;
export type GoalStatusInput = z.infer<typeof goalStatusSchema>;
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;