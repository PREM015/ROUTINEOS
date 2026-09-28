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
