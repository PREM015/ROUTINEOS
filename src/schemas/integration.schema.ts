import { z } from 'zod';

/**
 * Integration Validation Schemas
 * Validation for Integration model inputs and sync/queries
 */

export const integrationProviderSchema = z.enum([
  'GOOGLE_CALENDAR',
  'NOTION',
  'TODOIST',
  'TRELLO',
  'APPLE_HEALTH',
  'GOOGLE_FIT',
  'STRAVA',
  'SPOTIFY',
  'CUSTOM',
]);

export const connectIntegrationSchema = z.object({
  provider: integrationProviderSchema,
  code: z.string().min(1).optional(),
  redirectUri: z.string().url().optional(),
  accessToken: z
    .string()
    .min(1, 'Access token is required')
    .optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
  scopes: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const integrationUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

export const integrationSyncSchema = z.object({
  fullSync: z.boolean().optional(),
});

export type ConnectIntegrationInput = z.infer<typeof connectIntegrationSchema>;
export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>;
export type IntegrationSyncInput = z.infer<typeof integrationSyncSchema>;
export type IntegrationProviderValue = z.infer<typeof integrationProviderSchema>;