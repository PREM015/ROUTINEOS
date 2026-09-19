import { z } from 'zod';

/**
 * Time Tracking Validation Schemas
 */

/**
 * Coerce ISO-8601 strings into `Date` instances. `null` is rejected instead of
 * being coerced to the Unix epoch, unlike `z.coerce.date()`.
 */
const dateSchema = z.preprocess(
  (value) => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value),
  z.date()
);

const optionalDateSchema = dateSchema.optional();
const nullableDateSchema = z.union([z.null(), dateSchema]).optional();

const timeEntryBaseSchema = z.object({
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or less'),
  projectId: z.string().min(1).nullable().optional(),
  habitId: z.string().min(1).nullable().optional(),
  goalId: z.string().min(1).nullable().optional(),
  startTime: optionalDateSchema,
  endTime: nullableDateSchema,
  duration: z.number().int().positive().optional(),
  billable: z.boolean().optional(),
  rate: z.number().positive().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
  isAutomatic: z.boolean().optional(),
});

export const createTimeEntrySchema = timeEntryBaseSchema.refine(
  (data) => {
    if (!data.startTime || !data.endTime) return true;
    return data.endTime.getTime() >= data.startTime.getTime();
  },
  { message: 'endTime must be on or after startTime', path: ['endTime'] }
);

export const updateTimeEntrySchema = timeEntryBaseSchema.partial().refine(
  (data) => {
    if (!data.startTime || !data.endTime) return true;
    return data.endTime.getTime() >= data.startTime.getTime();
  },
  { message: 'endTime must be on or after startTime', path: ['endTime'] }
);

export const startTimeEntrySchema = z.object({
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or less'),
  projectId: z.string().min(1).optional(),
  habitId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  billable: z.boolean().optional(),
  rate: z.number().positive().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
  startTime: optionalDateSchema,
});

export const timeTrackingQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  projectId: z.string().optional(),
  goalId: z.string().optional(),
  habitId: z.string().optional(),
  billable: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
export type StartTimeEntryInput = z.infer<typeof startTimeEntrySchema>;
export type TimeTrackingQueryParams = z.infer<typeof timeTrackingQuerySchema>;