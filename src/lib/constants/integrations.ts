import type { IntegrationProvider } from '@prisma/client';

/**
 * Integration Constants
 * Provider definitions for third-party integrations.
 * Keys match the Prisma `IntegrationProvider` enum exactly.
 */

export interface IntegrationConfig {
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  authType: 'oauth' | 'apikey';
  scopes: readonly string[];
}

export const INTEGRATIONS: Record<IntegrationProvider, IntegrationConfig> = {
  GOOGLE_CALENDAR: {
    provider: 'GOOGLE_CALENDAR',
    name: 'Google Calendar',
    description: 'Two-way sync of routine blocks and calendar events',
    icon: '📅',
    enabled: true,
    authType: 'oauth',
    scopes: ['calendar.read', 'calendar.write'],
  },
  NOTION: {
    provider: 'NOTION',
    name: 'Notion',
    description: 'Sync habits and goals to Notion pages and databases',
    icon: '📓',
    enabled: true,
    authType: 'oauth',
    scopes: ['content.read', 'content.write'],
  },
  TODOIST: {
    provider: 'TODOIST',
    name: 'Todoist',
    description: 'Import tasks and sync completed habits as tasks',
    icon: '✅',
    enabled: true,
    authType: 'oauth',
    scopes: ['task.read', 'task.write', 'project.read'],
  },
  TRELLO: {
    provider: 'TRELLO',
    name: 'Trello',
    description: 'Link Trello cards as tasks and log progress',
    icon: '🗂️',
    enabled: true,
    authType: 'apikey',
    scopes: ['api.read', 'api.write'],
  },
  APPLE_HEALTH: {
    provider: 'APPLE_HEALTH',
    name: 'Apple Health',
    description: 'Import step count, sleep, and workout data',
    icon: '🍎',
    enabled: false,
    authType: 'oauth',
    scopes: ['health.read'],
  },
  GOOGLE_FIT: {
    provider: 'GOOGLE_FIT',
    name: 'Google Fit',
    description: 'Import activity, sleep, and heart rate data',
    icon: '💪',
    enabled: true,
    authType: 'oauth',
    scopes: ['fitness.activity.read', 'fitness.body.read'],
  },
  STRAVA: {
    provider: 'STRAVA',
    name: 'Strava',
    description: 'Sync workouts and calculate activity streaks',
    icon: '🚴',
    enabled: true,
    authType: 'oauth',
    scopes: ['activity.read', 'activity.read_all'],
  },
  SPOTIFY: {
    provider: 'SPOTIFY',
    name: 'Spotify',
    description: 'Track focus music and listening time',
    icon: '🎵',
    enabled: false,
    authType: 'oauth',
    scopes: ['user-read-currently-playing', 'user-read-recently-played'],
  },
  CUSTOM: {
    provider: 'CUSTOM',
    name: 'Custom API',
    description: 'Bring your own API key integration',
    icon: '🔌',
    enabled: false,
    authType: 'apikey',
    scopes: [],
  },
} as const;

export type IntegrationById = (typeof INTEGRATIONS)[IntegrationProvider];

export type IntegrationProviderId = keyof typeof INTEGRATIONS;

export function getIntegrationConfig(provider: IntegrationProvider): IntegrationById {
  return INTEGRATIONS[provider];
}

export function getEnabledIntegrations(): IntegrationById[] {
  return Object.values(INTEGRATIONS).filter(integration => integration.enabled);
}

export function getOAuthIntegrations(): IntegrationById[] {
  return Object.values(INTEGRATIONS).filter(integration => integration.authType === 'oauth');
}