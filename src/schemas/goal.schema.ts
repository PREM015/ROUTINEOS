import { z } from 'zod';
import { optionalNullableDateSchema } from '@/schemas/focus.schema';

/**
 * Goal Validation Schemas
 *
 * `createGoalSchema` deliberately omits `status`: a new goal is always ACTIVE.
 * `updateGoalSchema` adds it, because the Edit modal's Status select and the
 * check-in flow both send it. When it was missing, `z.object().partial()` still
 * stripped `status` (a plain `z.object` drops unknown keys), so the change
 * appeared to save and reverted on refresh, and the `status` branch in
 * `GoalService.updateGoal` was unreachable.
 *
 * Fields the Edit modal can empty are `.nullable()` so "clear it" is
 * representable — `undefined` never survives `JSON.stringify`.
 */
export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  // `priority` is `GoalPriority @default(MEDIUM)` in the schema, so it is not
  // nullable — sending null would be rejected by the column, not accepted.
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
  unit: z.string().nullable().optional(),
  startDate: optionalNullableDateSchema,
  endDate: optionalNullableDateSchema,
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
  appliesEveryDay: z.boolean().optional(),
  dayTypeIds: z.array(z.string().cuid()).optional(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z
    .enum(['ACTIVE', 'COMPLETED', 'MISSED', 'CARRIED_OVER', 'ON_HOLD', 'CANCELLED'] as const)
    .optional(),
});