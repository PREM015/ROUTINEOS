import { z } from 'zod';

/**
 * Focus & Break Validation Schemas
 */

/**
 * Coerce ISO-8601 strings into `Date` instances. `null` is rejected instead of
 * being coerced to the Unix epoch, unlike `z.coerce.date()`.
 */
const dateSchema = z.preprocess(
  (value) => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value),
  z.date()
);

export const optionalDateSchema = dateSchema.optional();

export const legacyCreateFocusSessionSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional(),
  categoryId: z.string().min(1).optional(),
  plannedDuration: z
    .number()
    .int()
    .positive('plannedDuration must be a positive number of minutes'),
  techniques: z.array(z.string().min(1).max(100)).optional(),
  energyBefore: z.number().int().min(1).max(5).optional(),
  startedAt: optionalDateSchema,
});

/**
 * Timer payload posted by the focus timer UI on complete/stop.
 * Seconds-based (1–180 minutes) so the client never has to convert to the
 * legacy minutes shape; the route normalizes it onto the FocusSession model.
 */
export const focusTimerTypeSchema = z.enum([
  'focus',
  'short-break',
  'long-break',
  'stopwatch',
]);

export const focusTimerPayloadSchema = z.object({
  type: focusTimerTypeSchema,
  plannedSeconds: z
    .number()
    .int()
    .positive('plannedSeconds must be a positive number of seconds')
    .max(180 * 60, 'plannedSeconds must not exceed 180 minutes'),
  actualSeconds: z
    .number()
    .int()
    .min(0, 'actualSeconds must not be negative')
    .max(180 * 60, 'actualSeconds must not exceed 180 minutes'),
  startedAt: optionalDateSchema,
  endedAt: optionalDateSchema,
  completed: z.boolean().optional(),
});

/**
 * Accepts either the legacy form shape or the timer payload shape, so a
 * well-formed client request can never 400. Failures still return `details`
 * via `error.flatten()` in the route.
 */
export const createFocusSessionSchema = z.union([
  legacyCreateFocusSessionSchema,
  focusTimerPayloadSchema,
]);

export const updateFocusSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  plannedDuration: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
});

export const completeFocusSessionSchema = z.object({
  focusRating: z.number().int().min(1).max(5).optional(),
  productivityRating: z.number().int().min(1).max(5).optional(),
  difficultyRating: z.number().int().min(1).max(5).optional(),
  energyAfter: z.number().int().min(1).max(5).optional(),
  distractions: z.array(z.string().min(1).max(200)).optional(),
  notes: z.string().max(2000).optional(),
});

export const focusQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .enum(['IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ACTIVE'])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const createBreakSchema = z.object({
  focusSessionId: z.string().min(1).optional(),
  breakType: z
    .enum(['SHORT', 'LONG', 'MEAL', 'WALK', 'REST', 'CUSTOM'])
    .optional(),
  startedAt: optionalDateSchema,
  endedAt: optionalDateSchema,
  durationMinutes: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
});

export const breakQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  breakType: z
    .enum(['SHORT', 'LONG', 'MEAL', 'WALK', 'REST', 'CUSTOM'])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type CreateFocusSessionInput = z.infer<typeof createFocusSessionSchema>;
export type UpdateFocusSessionInput = z.infer<typeof updateFocusSessionSchema>;
export type CompleteFocusSessionInput = z.infer<typeof completeFocusSessionSchema>;
export type FocusQueryParams = z.infer<typeof focusQuerySchema>;
export type CreateBreakInput = z.infer<typeof createBreakSchema>;
export type BreakQueryParams = z.infer<typeof breakQuerySchema>;