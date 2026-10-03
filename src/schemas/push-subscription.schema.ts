import { z } from 'zod';

/**
 * Push subscription input schemas.
 *
 * These were declared inline in `src/app/api/push-subscriptions/route.ts`, which
 * is the only reason a service could not validate the same shape — ERROR.md's
 * §1 recipe asks that the schema live in `src/schemas` so the service and the
 * route validate identically.
 */
export const deviceTypeSchema = z.enum([
  'WEB',
  'MOBILE_IOS',
  'MOBILE_ANDROID',
  'TABLET',
  'DESKTOP',
]);

export const createSubscriptionSchema = z.object({
  /**
   * Must be a URL: it is the Web Push endpoint the push service will POST to,
   * so a malformed value is stored and then silently never delivers.
   */
  endpoint: z.string().url('endpoint must be a valid URL'),
  p256dh: z.string().min(1, 'p256dh is required'),
  auth: z.string().min(1, 'auth is required'),
  deviceName: z.string().max(200, 'deviceName must be 200 characters or less').optional(),
  deviceType: deviceTypeSchema.optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/** The enum values a `deviceType` may take, as stored on the row. */
export const KNOWN_DEVICE_TYPES = [
  'WEB',
  'MOBILE_IOS',
  'MOBILE_ANDROID',
  'TABLET',
  'DESKTOP',
] as const;

export type KnownDeviceType = (typeof KNOWN_DEVICE_TYPES)[number];

/**
 * Narrow an untrusted `deviceType` to a real enum value.
 *
 * The column is a Prisma enum, so an unexpected string fails the entire insert
 * and the device fails to register with a 400 the UI cannot explain.
 * Anything unrecognised becomes `null` ("unknown"), which the device list already
 * handles.
 *
 * Needed because `deviceType` is sent as a free-form string by two different
 * callers: the settings page, and the older `/api/users/[id]/push-subscriptions`
 * route. That route was dropping the field entirely, so every device registered
 * through it stored `deviceType = null` and the list showed the raw device name
 * instead of a phone/laptop label.
 */
export function normalizeDeviceType(
  value: string | undefined | null
): KnownDeviceType | null {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  return (KNOWN_DEVICE_TYPES as readonly string[]).includes(upper)
    ? (upper as KnownDeviceType)
    : null;
}

/**
 * Loose shape accepted by the legacy per-user registration route.
 *
 * Deliberately permissive — it is applied to a raw `request.json()` cast, so the
 * required-field check is explicit in the service rather than inferred by Zod.
 */
export interface RegisterDeviceInput {
  endpoint?: string;
  p256dh?: string;
  /** Aliased from the Web Push `auth` field, which would shadow `auth()`. */
  auth?: string;
  deviceName?: string;
  deviceType?: string;
}
