/**
 * Client-safe mirrors of the Prisma enums used by settings UI.
 *
 * `@/generated/prisma` resolves to the Node client entry point (679 KB, with
 * Node built-in imports). Importing an enum from it as a *value* inside a
 * `'use client'` component pulls that into the browser bundle, so the enums are
 * duplicated here as plain objects and frozen const unions.
 *
 * `tests/lib/enums.test.ts` asserts these stay in sync with the Prisma schema.
 */

export const DeviceType = {
  WEB: 'WEB',
  MOBILE_IOS: 'MOBILE_IOS',
  MOBILE_ANDROID: 'MOBILE_ANDROID',
  TABLET: 'TABLET',
  DESKTOP: 'DESKTOP',
} as const;

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

/**
 * What kind of habit a `Habit` is — the tier that decides which habits are scored.
 *
 * Mirrored here for the same reason as the enums above: the analytics Habit Lab is a
 * `'use client'` component that needs the tier list at runtime, and importing
 * `HabitTier` from `@/generated/prisma` would pull the Node client into the browser
 * bundle.
 *
 * The member list is long and has changed shape before, so `tests/lib/prisma-enum-sync.test.ts`
 * parses `prisma/schema.prisma` and asserts these match. That test reads the schema as a
 * *file* rather than importing the generated client, so it needs no `DATABASE_URL` and
 * no generated output.
 */
export const HabitTier = {
  NON_NEGOTIABLE: 'NON_NEGOTIABLE',
  GROWTH: 'GROWTH',
  BONUS: 'BONUS',
  OPTIONAL: 'OPTIONAL',
  EXPERIMENTAL: 'EXPERIMENTAL',
  UNDEFINED: 'UNDEFINED',
  ALTERNATIVE: 'ALTERNATIVE',
  SPECIAL: 'SPECIAL',
  FLEXIBLE: 'FLEXIBLE',
  JUST_FOR_FUN: 'JUST_FOR_FUN',
  LIFESTYLE: 'LIFESTYLE',
} as const;

export type HabitTier = (typeof HabitTier)[keyof typeof HabitTier];

/**
 * Display order for the Habit Lab's tier filter chips.
 *
 * Deliberately **not** the declaration order above. The scored tiers come first because
 * they are the ones the rate is built from; everything else is unscored or optional, and
 * burying it keeps the chip row from reading as twelve equally important categories.
 * `UNDEFINED` is absent on purpose — it is the absence of a tier, not a kind of habit.
 */
export const HABIT_TIER_DISPLAY_ORDER: HabitTier[] = [
  'NON_NEGOTIABLE',
  'GROWTH',
  'BONUS',
  'ALTERNATIVE',
  'LIFESTYLE',
  'SPECIAL',
  'FLEXIBLE',
  'OPTIONAL',
  'JUST_FOR_FUN',
  'EXPERIMENTAL',
];

export const Theme = {
  LIGHT: 'LIGHT',
  DARK: 'DARK',
  AUTO: 'AUTO',
  CUSTOM: 'CUSTOM',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

export const SubscriptionPlan = {
  FREE: 'FREE',
  PRO: 'PRO',
  PREMIUM: 'PREMIUM',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  UNPAID: 'UNPAID',
} as const;

export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/**
 * What kind of timer row a `FocusSession` is.
 *
 * Imported as a *type* by `lib/focus/*`, which runs in the browser, so this
 * mirror is what keeps those modules off the Node Prisma entry point. The
 * runtime list lives in `lib/focus/type-backfill.ts`; this is only the union.
 */
export const FocusSessionType = {
  FOCUS: 'FOCUS',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK: 'LONG_BREAK',
  STOPWATCH: 'STOPWATCH',
} as const;

export type FocusSessionType =
  (typeof FocusSessionType)[keyof typeof FocusSessionType];

export const FocusSessionEndReason = {
  COMPLETED: 'COMPLETED',
  STOPPED: 'STOPPED',
  SKIPPED: 'SKIPPED',
  MODE_SWITCHED: 'MODE_SWITCHED',
  AUTO_STALE: 'AUTO_STALE',
  MANUAL: 'MANUAL',
} as const;

export type FocusSessionEndReason =
  (typeof FocusSessionEndReason)[keyof typeof FocusSessionEndReason];

export const FocusSessionSource = {
  TIMER: 'TIMER',
  MANUAL: 'MANUAL',
  RECOVERED: 'RECOVERED',
} as const;

export type FocusSessionSource =
  (typeof FocusSessionSource)[keyof typeof FocusSessionSource];

export const FocusEventType = {
  START: 'START',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  EXTEND: 'EXTEND',
  DISTRACTION: 'DISTRACTION',
  NOTE: 'NOTE',
  END: 'END',
  PAUSE_REASON: 'PAUSE_REASON',
} as const;

export type FocusEventType =
  (typeof FocusEventType)[keyof typeof FocusEventType];

export const FocusReflectionMode = {
  ALWAYS: 'ALWAYS',
  FOCUS_ONLY: 'FOCUS_ONLY',
  MIN_LENGTH: 'MIN_LENGTH',
  NEVER: 'NEVER',
} as const;

export type FocusReflectionMode =
  (typeof FocusReflectionMode)[keyof typeof FocusReflectionMode];

export const BreakType = {
  SHORT: 'SHORT',
  LONG: 'LONG',
  MEAL: 'MEAL',
  WALK: 'WALK',
  STRETCH: 'STRETCH',
  REST: 'REST',
  CUSTOM: 'CUSTOM',
} as const;

export type BreakType = (typeof BreakType)[keyof typeof BreakType];

/** Short human labels for an end reason. Reused by history rows and detail sheets. */
export const FOCUS_END_REASON_LABELS: Record<FocusSessionEndReason, string> = {
  COMPLETED: 'Completed',
  STOPPED: 'Stopped',
  SKIPPED: 'Skipped',
  MODE_SWITCHED: 'Mode switched',
  AUTO_STALE: 'Abandoned',
  MANUAL: 'Logged manually',
};

/**
 * True when an end reason means the session ran to its timebox.
 *
 * The only member of `FocusSessionEndReason` that does. Statistics, the
 * completion-rate numerator and the cycle counter all key on this rather than on
 * `completedAt != null`, because the two are not the same thing: a `MANUAL` entry
 * and a recovered session both set `completedAt` while meaning something quite
 * different from a completed timebox.
 */
export function isCompletedEndReason(reason: FocusSessionEndReason | null | undefined): boolean {
  return reason === 'COMPLETED';
}