import { z } from 'zod';

/**
 * Focus & Break Validation Schemas
 */

/**
 * Coerce ISO-8601 strings into `Date` instances. `null` is rejected instead of
 * being coerced to the Unix epoch, unlike `z.coerce.date()`.
 *
 * `z.coerce.date()` runs `new Date(input)`, and `new Date(null)` is
 * `1970-01-01T00:00:00.000Z` — a *valid* date. So `.optional()` does not help:
 * an explicit `null` still parses and silently persists the epoch. This is the
 * shared version, used by every schema that must be able to *clear* a date.
 */
export const dateSchema = z.preprocess(
  (value) => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value),
  z.date()
);

/** Same as {@link dateSchema} but also accepts an explicit `null` to clear. */
export const nullableDateSchema = z.preprocess(
  (value) => (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value),
  z.date().nullable()
);

export const optionalDateSchema = dateSchema.optional();

/** Optional *and* clearable: `.optional().nullable()`. */
export const optionalNullableDateSchema = nullableDateSchema.optional();

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

/** The stored `FocusSessionType` enum, for API input. */
export const focusSessionTypeSchema = z.enum([
  'FOCUS',
  'SHORT_BREAK',
  'LONG_BREAK',
  'STOPWATCH',
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
  completedAt: optionalDateSchema,
  abortedAt: optionalDateSchema,
  completed: z.boolean().optional(),
});

/**
 * "Start a session" — the request that creates a **running** row.
 *
 * This is the shape `POST /api/focus` uses when the user presses Start. It
 * deliberately has no `actualSeconds`/`completed`: a session that is still
 * running has no actual duration, and letting the client assert one would let a
 * client write finished work it never did. The row is created with
 * `completedAt: null, abortedAt: null`, which is exactly the shape
 * `findActiveByUserId` reads as "currently running" — so for the first time the
 * server actually knows a session is in flight.
 *
 * `plannedSeconds` is `null` for a stopwatch, which is open-ended. `null` is
 * distinct from `0` on purpose: `0` would be rejected as non-positive and would
 * also read as "zero-length plan" rather than "no plan".
 */
export const startFocusSessionSchema = z.object({
  type: focusTimerTypeSchema.default('focus'),
  plannedSeconds: z
    .number()
    .int()
    .positive('plannedSeconds must be a positive number of seconds')
    .max(180 * 60, 'plannedSeconds must not exceed 180 minutes')
    .nullable()
    .optional(),
  startedAt: optionalDateSchema,
  title: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

/**
 * Accepts either the legacy form shape, the timer payload shape, or the "start"
 * shape, so a well-formed client request can never 400 for shape reasons.
 * Failures still return `details` via `error.flatten()` in the route.
 */
export const createFocusSessionSchema = z.union([
  legacyCreateFocusSessionSchema,
  focusTimerPayloadSchema,
  startFocusSessionSchema,
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

/**
 * Ratings and notes, factored out so `/end` and `PATCH` validate them identically.
 *
 * Two schemas that are *meant* to agree but are written twice will eventually
 * disagree, and the symptom is a rating that saves at 23:59 and fails at 00:01.
 */
export const focusReflectionSchema = z.object({
  focusRating: z.number().int().min(1).max(5).optional(),
  productivityRating: z.number().int().min(1).max(5).optional(),
  difficultyRating: z.number().int().min(1).max(5).optional(),
  energyAfter: z.number().int().min(1).max(5).optional(),
  distractions: z.array(z.string().min(1).max(200)).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

/** The stored `FocusSessionEndReason`, accepted from clients. */
export const focusSessionEndReasonSchema = z.enum([
  'COMPLETED',
  'STOPPED',
  'SKIPPED',
  'MODE_SWITCHED',
  'AUTO_STALE',
  'MANUAL',
]);

/**
 * The generic transition body, kept for the original single-endpoint design.
 *
 * `/end`, `/pause` and `/resume` are separate routes now; this exists so a client
 * that posts a single `action` discriminated body is still understood rather than
 * 400ing on a shape it was written against.
 */
export const focusTransitionSchema = z.object({
  action: z.enum(['pause', 'resume', 'complete', 'abort']),
  ...focusReflectionSchema.shape,
});

/** A distraction or note captured mid-session. */
export const focusEventInputSchema = z.object({
  type: z.enum(['DISTRACTION', 'NOTE']),
  label: z.string().min(1).max(60).optional(),
  note: z.string().max(2000).optional(),
});

/** A recovery decision made by the user about an ambiguous session. */
export const focusRecoveryChoiceSchema = z.object({
  choice: z.enum(['credit-evidence', 'credit-full', 'discard']),
});

/** Query parameters for `GET /api/focus/stats`. */
export const focusStatsQuerySchema = z.object({
  /** Inclusive `YYYY-MM-DD`, in the user's zone. Defaults to 6 days ago. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  /** Inclusive `YYYY-MM-DD`, in the user's zone. Defaults to today. */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
});

/** `PATCH /api/focus/settings` — validated against the `FocusSettings` columns. */
export const focusSettingsPatchSchema = z.object({
  focusMinutes: z.number().int().min(1).max(180).optional(),
  shortBreakMinutes: z.number().int().min(1).max(60).optional(),
  longBreakMinutes: z.number().int().min(1).max(120).optional(),
  cyclesBeforeLongBreak: z.number().int().min(1).max(12).optional(),
  autoStartBreak: z.boolean().optional(),
  autoStartFocus: z.boolean().optional(),
  keepScreenAwake: z.boolean().optional(),
  reflectionMode: z.enum(['ALWAYS', 'FOCUS_ONLY', 'MIN_LENGTH', 'NEVER']).optional(),
  reflectionMinimumMinutes: z.number().int().min(1).max(180).optional(),
  dailyTargetMinutes: z.number().int().min(0).max(1440).optional(),
  streakDayMinutes: z.number().int().min(1).max(720).optional(),
  weeklyTargetMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  soundEnabled: z.boolean().optional(),
  soundVolume: z.number().int().min(0).max(100).optional(),
  ambientSound: z.string().max(60).nullable().optional(),
  showWallClock: z.boolean().optional(),
  breakSuggestions: z.boolean().optional(),
  adaptiveSuggestions: z.boolean().optional(),
});

export const focusPresetInputSchema = z.object({
  name: z.string().min(1).max(60),
  focusMinutes: z.number().int().min(1).max(180),
  shortBreakMinutes: z.number().int().min(1).max(60),
  longBreakMinutes: z.number().int().min(1).max(120),
  cyclesBeforeLongBreak: z.number().int().min(1).max(12),
  categoryId: z.string().min(1).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(8).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const focusDayTypeTargetSchema = z.object({
  dayTypeId: z.string().min(1),
  /**
   * `null` clears the override, which is different from `0`.
   *
   * "No override - fall back to the daily target" and "override to zero focus minutes"
   * are opposite instructions, so the clear operation needs its own value. Without it
   * a client can only ever set a target, never remove one.
   */
  targetMinutes: z.number().int().min(1).max(1440).nullable(),
});

export const focusContextQuerySchema = z.object({
  /** `YYYY-MM-DD`; defaults to the user's today. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
});

export const focusQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z
    .enum([
      'IN_PROGRESS',
      'PAUSED',
      'COMPLETED',
      // Ended early by the user. Previously missing, so there was no way to
      // filter for abandoned sessions.
      'ABORTED',
      'ACTIVE',
    ])
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  /**
   * Stored session type.
   *
   * Pushed into the Prisma `where` rather than filtered in JS — see
   * `FocusRepository.buildSessionsWhere`. A client-side filter would make
   * `meta.total` describe one page instead of the whole result set.
   */
  type: focusSessionTypeSchema.optional(),
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
export type StartFocusSessionInput = z.infer<typeof startFocusSessionSchema>;
export type FocusTransitionInput = z.infer<typeof focusTransitionSchema>;
export type FocusEventInput = z.infer<typeof focusEventInputSchema>;
export type FocusRecoveryChoice = z.infer<typeof focusRecoveryChoiceSchema>;
export type FocusStatsQueryParams = z.infer<typeof focusStatsQuerySchema>;
export type FocusSettingsPatch = z.infer<typeof focusSettingsPatchSchema>;
export type FocusPresetInput = z.infer<typeof focusPresetInputSchema>;