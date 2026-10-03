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