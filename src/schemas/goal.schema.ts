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

  /**
   * `completedAt` is now declared.
   *
   * `GoalService.updateGoal` has read `input.completedAt` for a long time, but
   * this schema is a plain `z.object`, which **silently drops keys it does not
   * declare**. So the value could never arrive: a caller setting it got a 200 and
   * a row whose `completedAt` was unchanged. That is the same failure mode as the
   * missing `status` noted above, on a field whose service branch has always been
   * dead.
   *
   * Nullable, because clearing it is a real operation — and `updateGoal` now
   * derives it from `status` anyway, so this is the explicit override for when a
   * caller wants a specific timestamp.
   */
  completedAt: z.date().nullable().optional(),
});

/**
 * Per-day check-off for DAILY goals.
 *
 * Was declared inline in `src/app/api/goals/[id]/checkin/route.ts`, which meant
 * the service could not validate its own input — it had to trust the route had
 * already done so.
 */
export const goalCheckinSchema = z.object({
  /**
   * A bare `YYYY-MM-DD`, not a timestamp.
   *
   * Anchored so a full ISO datetime is rejected outright: the service stores this
   * as `new Date(\`${date}T00:00:00.000Z\`)`, and a value that already carried a
   * time component would be silently reinterpreted.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  completed: z.boolean(),
});

export type GoalCheckinInput = z.infer<typeof goalCheckinSchema>;