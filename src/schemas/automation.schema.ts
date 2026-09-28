import { z } from 'zod';

/**
 * Every `triggerType` and `actionType` listed here is implemented by
 * `AutomationService`.
 *
 * `LOCATION_ENTERED` was removed rather than left accepted-but-dead: the
 * `Location` table has no repository, no service, and no client integration, so
 * the trigger could never be evaluated. Keeping it in the enum let users create
 * a rule that silently never fired.
 *
 * Adding a value here without implementing it in the service is the exact
 * failure mode this file is guarding against, so the lists are deliberately
 * kept short and honest.
 */
export const AUTOMATION_TRIGGER_TYPES = [
  'HABIT_COMPLETED',
  'TIME_REACHED',
  'SCORE_THRESHOLD',
] as const;

export const AUTOMATION_ACTION_TYPES = [
  'CREATE_TASK',
  'CREATE_HABIT',
  'SEND_NOTIFICATION',
  'UPDATE_GOAL',
  'DECREMENT',
] as const;

export const automationSchema = z.object({
  name: z
    .string()
    .min(1, 'Rule name is required')
    .max(200, 'Rule name must be 200 characters or less'),
  triggerType: z.enum(AUTOMATION_TRIGGER_TYPES),
  triggerConfig: z.record(z.unknown()),
  actionType: z.enum(AUTOMATION_ACTION_TYPES),
  actionConfig: z.record(z.unknown()),
  isActive: z.boolean().optional(),
});

export const updateAutomationSchema = automationSchema.partial();

export const automationQuerySchema = z.object({
  isActive: z.boolean().optional(),
  triggerType: z.enum(AUTOMATION_TRIGGER_TYPES).optional(),
  actionType: z.enum(AUTOMATION_ACTION_TYPES).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreateAutomationInput = z.infer<typeof automationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type AutomationQueryParams = z.infer<typeof automationQuerySchema>;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];
