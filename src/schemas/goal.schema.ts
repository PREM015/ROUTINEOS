import { z } from 'zod';

export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  priority: z
    .enum([
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
      'PERSONAL',
      'ACADEMIC',
      'PROFESSIONAL',
      'NON_PROFIT',
    ])
    .optional(),
  targetValue: z.number().positive(),
  currentValue: z.number().min(0).optional(),
  unit: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  projectId: z.string().cuid().optional(),
  parentGoalId: z.string().cuid().optional(),
  isPublic: z.boolean().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
  milestones: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        targetValue: z.number().optional(),
        dueDate: z.coerce.date().optional(),
      })
    )
    .optional(),
});

export const updateGoalSchema = createGoalSchema.partial();