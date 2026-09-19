import { z } from 'zod';

export const automationSchema = z.object({
  name: z.string().min(1, 'Rule name is required').max(200, 'Rule name must be 200 characters or less'),
  triggerType: z.enum(['HABIT_COMPLETED', 'TIME_REACHED', 'LOCATION_ENTERED', 'SCORE_THRESHOLD']),
  triggerConfig: z.record(z.unknown()),
  actionType: z.enum(['CREATE_TASK', 'CREATE_HABIT', 'SEND_NOTIFICATION', 'UPDATE_GOAL', 'DECREMENT']),
  actionConfig: z.record(z.unknown()),
  isActive: z.boolean().optional(),
});

export const updateAutomationSchema = automationSchema.partial();

export const automationQuerySchema = z.object({
  isActive: z.boolean().optional(),
  triggerType: z.enum(['HABIT_COMPLETED', 'TIME_REACHED', 'LOCATION_ENTERED', 'SCORE_THRESHOLD']).optional(),
  actionType: z.enum(['CREATE_TASK', 'CREATE_HABIT', 'SEND_NOTIFICATION', 'UPDATE_GOAL', 'DECREMENT']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreateAutomationInput = z.infer<typeof automationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type AutomationQueryParams = z.infer<typeof automationQuerySchema>;