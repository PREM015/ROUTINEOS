import { z } from 'zod';

const timezoneSchema = z
  .string()
  .min(1, 'Timezone is required')
  .max(64, 'Timezone must be 64 characters or less')
  .refine(
    (value) => value.includes('/'),
    'Timezone must be a valid IANA identifier such as Asia/Kolkata'
  );

/**
 * `displayName`, `bio` and `avatarUrl` are nullable so they can be *cleared*.
 *
 * The profile page used to send `undefined` for an emptied field, but
 * `JSON.stringify` drops undefined properties, so the key never reached the
 * server and clearing a bio or display name silently did nothing. Sending `''`
 * was not an option for `avatarUrl` because it fails `.url()`.
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be 50 characters or less')
    .optional(),
  displayName: z
    .string()
    .max(50, 'Display name must be 50 characters or less')
    .nullable()
    .optional(),
  bio: z.string().max(500, 'Bio must be 500 characters or less').nullable().optional(),
  avatarUrl: z
    .string()
    .url('Avatar URL must be a valid URL')
    .nullable()
    .optional(),
  timezone: timezoneSchema.optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
});

export const userPreferencesSchema = z.object({
  preferredLanguage: z.string().min(2).max(10).optional(),
  timezone: timezoneSchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  theme: z.enum(['LIGHT', 'DARK', 'AUTO', 'CUSTOM']).optional(),
  locale: z.string().min(2).max(10).optional(),
});

export const updateTimezoneSchema = z.object({
  timezone: timezoneSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type UpdateTimezoneInput = z.infer<typeof updateTimezoneSchema>;