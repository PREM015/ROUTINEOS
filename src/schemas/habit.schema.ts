import { z } from 'zod';
import { optionalNullableDateSchema } from '@/schemas/focus.schema';
import { HABIT_TIERS_ORDERED } from '@/constants/habit-tiers';
import {
  HABIT_FREQUENCY_TYPES,
  HABIT_TRACKING_TYPES,
  HABIT_DIRECTIONS,
  TIME_OF_DAY_ORDER,
} from '@/constants/prisma-enums';
import { MIN_TARGET_VALUE } from '@/lib/habits/completion';

/**
 * Habit Validation Schemas
 *
 * Note on clearing fields: a plain `z.object()` *strips* unknown keys, and
 * `JSON.stringify` drops `undefined` values. So a UI that sends
 * `{ description: undefined }` to mean "clear this" never reaches the server at
 * all. Every field the Edit modal can empty is therefore declared
 * `.nullable()` here, and the UI sends `null` instead of `undefined`.
 */

/**
 * A target must be a finite, strictly positive number.
 *
 * `z.number()` alone accepts `NaN`, `Infinity` and negatives, all of which
 * would silently break every comparison in `lib/habits/completion.ts`. The floor
 * is deliberately tiny rather than 1: 30 push-ups, 0.5 L of water and 7.5 hours
 * of sleep are all legitimate, and are exactly the values the old integer
 * target rejected.
 *
 * The shared floor lives in `lib/habits/completion.ts` (`MIN_TARGET_VALUE`) so
 * the validator and the calculator cannot drift; it is re-stated here as the
 * predicate rather than imported as a number, because Zod's `.refine` needs the
 * boolean and importing the constant alone would not express the rule.
 */
const targetValueSchema = z
  .number()
  .refine(
    (v) => Number.isFinite(v) && v >= MIN_TARGET_VALUE,
    'Target must be a positive, finite number'
  );

const unitSchema = z.string().trim().min(1).max(16).nullable().optional();

/**
 * Enum schemas typed to the generated unions.
 *
 * The `z.ZodType<...>` wrapper is what keeps Zod from widening to `string`. Both
 * the frequency list and the new tracking/direction lists need it: without it,
 * `z.infer` produces `string | undefined`, which will not assign to
 * `HabitTrackingType | undefined` at the service boundary and forces a cast
 * into every call site.
 *
 * These are `z.enum` arrays rather than hand-written literal tuples so the
 * canonical list lives in exactly one place (`src/constants/prisma-enums.ts`)
 * and `tests/lib/enums.test.ts` can keep the mirror honest.
 */
const frequencyTypeSchema = z.enum(
  HABIT_FREQUENCY_TYPES as [string, ...string[]]
) as unknown as z.ZodType<(typeof HABIT_FREQUENCY_TYPES)[number]>;

const trackingTypeSchema = z.enum(
  HABIT_TRACKING_TYPES as [string, ...string[]]
) as unknown as z.ZodType<(typeof HABIT_TRACKING_TYPES)[number]>;

const directionSchema = z.enum(
  HABIT_DIRECTIONS as [string, ...string[]]
) as unknown as z.ZodType<(typeof HABIT_DIRECTIONS)[number]>;

const timeOfDaySchema = z.enum(
  TIME_OF_DAY_ORDER as [string, ...string[]]
) as unknown as z.ZodType<(typeof TIME_OF_DAY_ORDER)[number]>;

const tierSchema = z.enum(
  HABIT_TIERS_ORDERED as [string, ...string[]]
) as z.ZodType<(typeof HABIT_TIERS_ORDERED)[number]>;

export const createHabitSchema = z.object({
  name: z
    .string()
    .min(1, 'Habit name is required')
    .max(100, 'Habit name must be 100 characters or less'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .nullable()
    .optional(),
  tier: tierSchema,
  categoryId: z.string().cuid().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
  icon: z.string().nullable().optional(),
  frequencyType: frequencyTypeSchema,
  // Nullable so switching frequencyType away from SPECIFIC_WEEKDAYS can clear
  // the stored "1,3,5" list. Left set, that stale value crashed the Schedule tab
  // (it JSON.parse()d a comma-joined string).
  frequencyValue: z.string().nullable().optional(),
  targetCount: z.number().int().positive().nullable().optional(),

  // --- Numeric / avoid / limit habits -------------------------------------
  trackingType: trackingTypeSchema.optional(),
  direction: directionSchema.optional(),
  targetValue: targetValueSchema.nullable().optional(),
  unit: unitSchema,
  timeOfDay: timeOfDaySchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  linkedMetricType: z.string().trim().max(64).nullable().optional(),
  /**
   * Only meaningful with `frequencyType: 'EVERY_N_DAYS'`, where it must be at
   * least 1. Validated independently of the frequency type so a client that
   * sends the pair in either order is not rejected; the service clears a stale
   * gap when the type is anything else.
   */
  intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
  parentHabitId: z.string().cuid().nullable().optional(),
  /**
   * Set when this habit was created from a catalogue row. Recorded purely as a
   * provenance badge; the personal row is already an independent copy, so
   * changing or deleting the definition later cannot alter this habit.
   */
  definitionId: z.string().cuid().nullable().optional(),

  startDate: optionalNullableDateSchema,
  endDate: optionalNullableDateSchema,
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  points: z.number().positive().optional(),
  estimatedDuration: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  isPublic: z.boolean().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
  appliesEveryDay: z.boolean().optional(),
  dayTypeIds: z.array(z.string().cuid()).optional(),
});

/*
 * The cross-field rules ("a COUNT/DURATION habit needs a target", "EVERY_N_DAYS
 * needs an interval") live in `HabitService.assertTargetIsUsable` rather than a
 * `.superRefine()` here, because `superRefine` returns a `ZodEffects` in Zod v3
 * and that has neither `.partial()` nor `.shape` — `updateHabitSchema` and
 * `schemas/import.schema.ts` both need those. The rules are still enforced, and
 * enforced against the *merged* habit rather than just the patch, which is the
 * stronger check.
 */

export const updateHabitSchema = createHabitSchema.partial().extend({
  // `status` is set by the pause/resume/archive actions and by the Edit modal's
  // Status select. It must be declared here or `z.object` strips it and the
  // change silently reverts.
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED'] as const).optional(),
});

export const logHabitSchema = z.object({
  habitId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL'] as const),
  // Optional AND nullable. `z.coerce.date().optional()` would turn an explicit
  // `null` (un-checking a habit) into 1970-01-01 and persist that, because
  // `new Date(null)` is a valid date.
  completedAt: optionalNullableDateSchema,
  durationMinutes: z.number().int().positive().optional(),
  /**
   * A float, not an int. 7.5 hours of sleep and 2.5 L of water are both real
   * values, and the old integer schema rejected them outright.
   *
   * Zero is allowed (it is a legitimate reading of "0 screens", "0 glasses")
   * but negative numbers are not: they would satisfy a LIMIT habit by being
   * "under" the target.
   */
  quantity: z.number().finite().min(0).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  moodBefore: z.number().int().min(1).max(5).optional(),
  moodAfter: z.number().int().min(1).max(5).optional(),
  note: z.string().nullable().optional(),
});

export const habitQuerySchema = z.object({
  status: z.array(z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED', 'DRAFT'] as const)).optional(),
  // Includes NON_NEGOTIABLE, which both habit modals offer. It was missing here,
  // so `GET /api/habits?tier=NON_NEGOTIABLE` returned 400.
  tier: z.array(z.enum(['NON_NEGOTIABLE', 'GROWTH', 'BONUS', 'LIFESTYLE', 'FLEXIBLE', 'ALTERNATIVE', 'OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN', 'UNDEFINED'] as const)).optional(),
  categoryId: z.string().cuid().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'streak', 'completionRate', 'sortOrder'] as const).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includeArchived: z.boolean().optional(),
  dayTypeId: z.string().cuid().optional(),
  // Frequency filter. Declared but missing until now, so "show me my daily /
  // weekly / monthly / yearly habits" could not be expressed as a query and the
  // repository had no predicate for it.
  frequencyType: z.array(frequencyTypeSchema).optional(),
  trackingType: z.enum(['BOOLEAN', 'COUNT', 'DURATION'] as const).optional(),
  timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANYTIME'] as const).optional(),
  parentHabitId: z.string().cuid().optional(),
});

/**
 * Catalogue browsing.
 *
 * Read-only for every signed-in user; the admin-only write surface is
 * `createHabitDefinitionSchema` / `updateHabitDefinitionSchema` below.
 */
export const habitDefinitionQuerySchema = z.object({
  category: z.string().trim().max(64).optional(),
  search: z.string().trim().max(100).optional(),
  tier: z
    .enum([
      'NON_NEGOTIABLE',
      'GROWTH',
      'BONUS',
      'OPTIONAL',
      'EXPERIMENTAL',
      'UNDEFINED',
      'ALTERNATIVE',
      'SPECIAL',
      'FLEXIBLE',
      'JUST_FOR_FUN',
      'LIFESTYLE',
    ] as const)
    .optional(),
  includeInactive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

const habitDefinitionBase = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, digits and hyphens'),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(64).nullable().optional(),
  tier: tierSchema.optional(),
  frequencyType: frequencyTypeSchema.optional(),
  frequencyValue: z.string().nullable().optional(),
  targetValue: targetValueSchema.nullable().optional(),
  unit: unitSchema,
  targetCount: z.number().int().positive().nullable().optional(),
  intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
  trackingType: trackingTypeSchema.optional(),
  direction: directionSchema.optional(),
  timeOfDay: timeOfDaySchema.nullable().optional(),
  linkedMetricType: z.string().trim().max(64).nullable().optional(),
  icon: z.string().trim().max(16).nullable().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export const createHabitDefinitionSchema = habitDefinitionBase;

export const updateHabitDefinitionSchema = habitDefinitionBase.partial();

/**
 * Adding a catalogue entry to the user's own habits.
 *
 * `overrides` is the whole point: the user may change *anything* after
 * selecting, and the personal row is a copy, so there is no lock-in. Every key
 * is optional and the service falls back to the definition's suggested value
 * for anything omitted — including an explicit `targetValue`, which is how
 * "15,000 for me, 12,000 for you" works.
 */
export const addFromDefinitionSchema = z.object({
  definitionId: z.string().cuid(),
  overrides: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      tier: tierSchema.optional(),
      categoryId: z.string().cuid().nullable().optional(),
      trackingType: trackingTypeSchema.optional(),
      direction: directionSchema.optional(),
      targetValue: targetValueSchema.nullable().optional(),
      unit: unitSchema,
      targetCount: z.number().int().positive().nullable().optional(),
      frequencyType: frequencyTypeSchema.optional(),
      frequencyValue: z.string().nullable().optional(),
      intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
      timeOfDay: timeOfDaySchema.nullable().optional(),
      icon: z.string().trim().max(16).nullable().optional(),
      color: z.string().regex(/^#[0-9A-F]{6}$/i).nullable().optional(),
      sortOrder: z.number().int().min(0).max(10_000).optional(),
      startDate: optionalNullableDateSchema,
      reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    })
    .optional(),
});

/**
 * Previewing and applying a starter pack.
 *
 * Both take the *same* optional `overrides` keyed by habit name, so the preview
 * a user confirms is byte-for-byte what the apply writes. Keying by name rather
 * than by id is deliberate: a pack is a bundle of suggestions, and the preview
 * has to be readable before any row exists.
 */
const starterPackOverridesSchema = z
  .object({
    tier: tierSchema.optional(),
    targetValue: targetValueSchema.nullable().optional(),
    unit: unitSchema,
    frequencyType: frequencyTypeSchema.optional(),
    frequencyValue: z.string().nullable().optional(),
    intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
    timeOfDay: timeOfDaySchema.nullable().optional(),
    trackingType: trackingTypeSchema.optional(),
    direction: directionSchema.optional(),
    /** Skip this habit from the pack entirely. */
    excluded: z.boolean().optional(),
  })
  .optional();

export const previewStarterPackSchema = z.object({
  overrides: z.record(z.string(), starterPackOverridesSchema).optional(),
});

export const applyStarterPackSchema = z.object({
  templateId: z.string().cuid().optional(),
  overrides: z.record(z.string(), starterPackOverridesSchema).optional(),
  /** Tier 2 habits start this many days after the pack is applied. */
  tier2StartDelayDays: z.number().int().min(0).max(365).optional(),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type LogHabitInput = z.infer<typeof logHabitSchema>;
export type HabitQueryParams = z.infer<typeof habitQuerySchema>;
export type CreateHabitDefinitionInput = z.infer<typeof createHabitDefinitionSchema>;
export type UpdateHabitDefinitionInput = z.infer<typeof updateHabitDefinitionSchema>;
export type AddFromDefinitionInput = z.infer<typeof addFromDefinitionSchema>;
export type ApplyStarterPackInput = z.infer<typeof applyStarterPackSchema>;