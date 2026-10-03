import { z } from 'zod';
import { DAY_TYPES_ORDERED } from '@/constants/routine';

/**
 * Canonical `DayType` validator, built from the one ordered enum list in
 * `constants/routine`. Never re-declare day-type literals in a zod enum — a
 * hand-written list is how the invalid 'WEEKDAY' value got accepted by the API.
 */
export const dayTypeSchema = z.enum(
  DAY_TYPES_ORDERED as [string, ...string[]]
) as z.ZodType<(typeof DAY_TYPES_ORDERED)[number]>;

// ============================================================================
// Shared primitives
// ============================================================================

export const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm`, as stored on `RoutineBlock.startTime` / `endTime`. */
export const timeSchema = z.string().regex(HH_MM, 'Must be a time in HH:mm format');

/** `YYYY-MM-DD`. */
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

/**
 * A `DayTypeDefinition` primary key.
 *
 * Deliberately `min(1)` and not `cuid()`. The id is an *opaque* Prisma key: the
 * authoritative check that a client sent one the caller owns is the repository
 * lookup in the service, not the shape of the string. Validating it as a uuid
 * (which this once did) rejected every real id with "Invalid uuid", and a
 * `cuid()` pattern guard is one more thing to break if the key strategy is ever
 * changed.
 */
export const dayTypeIdSchema = z.string().min(1);

/**
 * `RoutineBlock.energyLevel`.
 *
 * `.nullable()`, not just `.optional()`. `z.object` strips unknown keys and an
 * absent-but-not-nullable field cannot be cleared, so the Energy select could
 * only ever *set* a level: sending `null` was rejected and sending `undefined`
 * was dropped by `JSON.stringify`, which is why "clear the energy level" was
 * impossible from the client.
 */
export const energyLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable();

/** All four members of the `RoutineLogStatus` enum, in one place. */
export const routineLogStatusSchema = z.enum([
  'COMPLETED',
  'PARTIAL',
  'MISSED',
  'IN_PROGRESS',
]);

/** 1-5 rating columns on `RoutineLog`. */
export const ratingSchema = z.number().int().min(1).max(5);

// ============================================================================
// Block create / update — the standalone `POST|PUT /api/routine` shape
// ============================================================================

/**
 * Fields that make a `RoutineBlock`.
 *
 * A block is stored under a per-day-type `RoutineTemplate` that is
 * auto-provisioned on first use, so there is no `templateId` in this payload:
 * the block is addressed by day type, and the service resolves the template.
 */
const blockFields = {
  title: z.string().min(1, 'Title is required').max(100),
  startTime: timeSchema,
  endTime: timeSchema,
  dayTypeId: dayTypeIdSchema.optional(),
  dayType: dayTypeSchema.optional(),
  /** `Category` primary key. Validated for shape; ownership is the service's. */
  categoryId: z.string().min(1).optional(),
  /** Clear the category. Only meaningful on update. */
  clearCategory: z.boolean().optional(),
  color: z.string().min(1).max(20).nullable().optional(),
  icon: z.string().min(1).max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  trackCompletion: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  energyLevel: energyLevelSchema.optional(),
  /**
   * The date the write is happening *in the context of*, `YYYY-MM-DD`.
   *
   * Not a `RoutineBlock` column. It exists solely so the service can enforce the
   * retroactive edit window on block writes, not just on logs (F6). `/routine`
   * sends the date it is rendering; `/settings/routine` omits it and is
   * therefore unaffected. Optional *and* nullable so "no date in play" is
   * expressible without inventing a sentinel.
   */
  date: calendarDateSchema.nullable().optional(),
};

/**
 * A standalone routine block, sent to `POST /api/routine`.
 *
 * `dayTypeId` (a `DayTypeDefinition` id) and `dayType` (the six-value enum) are
 * two different identifiers for the same idea. `dayTypeId` wins when both are
 * present: it is the only one that can distinguish two user-defined day types,
 * which both classify as `CUSTOM`.
 */
export const createRoutineBlockSchema = z.object(blockFields);

export const updateRoutineBlockSchema = z.object({
  id: z.string().min(1),
  ...blockFields,
  title: blockFields.title.optional(),
  startTime: blockFields.startTime.optional(),
  endTime: blockFields.endTime.optional(),
});

/**
 * Delete by id, with the same optional `date` context as the block writes.
 *
 * `date` is what lets the service refuse to delete a block out from under a date
 * the user has already locked. `/settings/routine` omits it.
 */
export const deleteRoutineSchema = z.object({
  id: z.string().min(1),
  date: calendarDateSchema.nullable().optional(),
});

/**
 * Bulk-apply a day type's schedule across a date range.
 *
 * `startDate` must be `<= endDate`; the service enforces that plus a 366-day
 * ceiling, because a range with the dates reversed or unbounded is the shape a
 * fat-fingered payload takes, and one request must not be able to write a
 * thousand exceptions.
 *
 * Addressed by `dayTypeId` (preferred) or `dayType`, exactly like the
 * single-block create path, so the service resolves the template the same way in
 * both cases and the client cannot end up pointing a range at a template the
 * single-create path would have ignored.
 */
export const applyTemplateToRangeSchema = z.object({
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  dayTypeId: dayTypeIdSchema.nullable().optional(),
  dayType: dayTypeSchema.nullable().optional(),
  /** Replace dates that already carry an exception. Off by default. */
  overwrite: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export type ApplyTemplateToRangeRequest = z.infer<typeof applyTemplateToRangeSchema>;

// ============================================================================
// Templates
// ============================================================================

export const createRoutineTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  dayType: dayTypeSchema,
  isDefault: z.boolean().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export const updateRoutineTemplateRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
});

// ============================================================================
// Logs — `POST /api/routine/today`
// ============================================================================

/**
 * A routine-log write.
 *
 * Every optional `RoutineLog` column is accepted, not just `note`. The columns
 * (`actualStartTime`, `actualEndTime`, `focusRating`, `productivityRating`,
 * `energyLevel`, `note`) have always existed; the endpoint accepted `status`
 * and nothing else, so there was no way to record how a block actually went.
 *
 * All four `RoutineLogStatus` members are accepted. `IN_PROGRESS` is what the
 * timeline's "Start" action writes, and rejecting it meant starting a block was
 * impossible to record.
 */
export const logRoutineBlockTodaySchema = z.object({
  blockId: z.string().min(1),
  date: calendarDateSchema,
  status: routineLogStatusSchema,
  note: z.string().max(2000).nullable().optional(),
  actualStartTime: timeSchema.nullable().optional(),
  actualEndTime: timeSchema.nullable().optional(),
  focusRating: ratingSchema.nullable().optional(),
  productivityRating: ratingSchema.nullable().optional(),
  energyLevel: ratingSchema.nullable().optional(),
  /** Untick: delete the log row for (block, date) rather than write a status. */
  clear: z.boolean().optional(),
});

// ============================================================================
// Inferred types
// ============================================================================

export type CreateRoutineBlockRequest = z.infer<typeof createRoutineBlockSchema>;
export type UpdateRoutineBlockRequest = z.infer<typeof updateRoutineBlockSchema>;
export type CreateRoutineTemplateRequest = z.infer<typeof createRoutineTemplateRequestSchema>;
export type UpdateRoutineTemplateRequest = z.infer<typeof updateRoutineTemplateRequestSchema>;
export type LogRoutineBlockTodayRequest = z.infer<typeof logRoutineBlockTodaySchema>;
export type RoutineLogStatusRequest = z.infer<typeof routineLogStatusSchema>;