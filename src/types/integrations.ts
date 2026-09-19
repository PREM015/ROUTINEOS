import type {
  Integration,
  CalendarSync,
  Location,
  User,
  IntegrationProvider,
} from '@prisma/client';

/**
 * Integration & Automation Types
 * Complete type system for third-party integrations, calendar sync, and locations
 */

// ============================================================================
// Core Integration Types
// ============================================================================

export interface IntegrationWithRelations extends Integration {
  user: Pick<User, 'id' | 'email'>;
}

export interface IntegrationSafeView {
  id: string;
  provider: IntegrationProvider;
  isActive: boolean;
  scopes: string[];
  lastSyncedAt: Date | null;
  syncError: string | null;
  connectedAt: Date;
  expiresAt: Date | null;
  needsReauth: boolean;
}

export interface IntegrationListItem {
  id: string;
  provider: IntegrationProvider;
  providerName: string;
  isActive: boolean;
  scopes: string[];
  lastSyncedAt: Date | null;
  needsReauth: boolean;
  settings?: IntegrationSettings;
}

export interface IntegrationSettings {
  calendarId?: string;
  taskListId?: string;
  autoSync?: boolean;
  syncDirection?: 'READ' | 'WRITE' | 'BOTH';
  defaultProjectId?: string;
  [key: string]: unknown;
}

export type IntegrationAuthState =
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'INVALID'
  | 'NOT_CONNECTED';

export type IntegrationSyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR' | 'PARTIAL';

// ============================================================================
// Integration Connection Lifecycle
// ============================================================================

export interface ConnectIntegrationInput {
  provider: IntegrationProvider;
  code?: string;
  redirectUri?: string;
  scopes?: string[];
  isActive?: boolean;
  settings?: IntegrationSettings;
}

export interface ConnectIntegrationResponse {
  success: boolean;
  integration?: IntegrationSafeView;
  requiresRedirect?: boolean;
  authorizationUrl?: string;
  message?: string;
}

export interface UpdateIntegrationInput {
  isActive?: boolean;
  settings?: IntegrationSettings;
  scopes?: string[];
}

export interface UpdateIntegrationResponse {
  success: boolean;
  integration?: IntegrationSafeView;
  message?: string;
}

export interface DisconnectIntegrationInput {
  provider: IntegrationProvider;
  reason?: string;
}

export interface DisconnectIntegrationResponse {
  success: boolean;
  message?: string;
}

export interface ReauthorizeIntegrationInput {
  provider: IntegrationProvider;
  redirectUri?: string;
}

export interface ReauthorizeIntegrationResponse {
  success: boolean;
  authorizationUrl?: string;
  requiresRedirect?: boolean;
  message?: string;
}

// ============================================================================
// OAuth & Token Handling
// ============================================================================

export interface OAuthConfig {
  provider: IntegrationProvider;
  clientId: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface OAuthCallbackInput {
  provider: IntegrationProvider;
  code: string;
  state: string;
  redirectUri?: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  integration?: IntegrationSafeView;
  stateValid?: boolean;
  error?: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string[];
}

// ============================================================================
// Sync
// ============================================================================

export interface SyncIntegrationInput {
  provider: IntegrationProvider;
  fullSync?: boolean;
}

export interface SyncIntegrationResponse {
  success: boolean;
  result?: IntegrationSyncResult;
  message?: string;
}

export interface IntegrationSyncResult {
  status: IntegrationSyncStatus;
  syncedAt: Date;
  itemsSynced: number;
  itemsFailed: number;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Provider Capabilities
// ============================================================================

export type IntegrationCapability =
  | 'CALENDAR'
  | 'TASKS'
  | 'HEALTH'
  | 'ACTIVITY'
  | 'NOTES'
  | 'AUDIO'
  | 'PROJECT_MANAGEMENT';

export const INTEGRATION_CAPABILITIES: Record<IntegrationProvider, IntegrationCapability[]> = {
  GOOGLE_CALENDAR: ['CALENDAR'],
  NOTION: ['NOTES', 'TASKS', 'PROJECT_MANAGEMENT'],
  TODOIST: ['TASKS'],
  TRELLO: ['PROJECT_MANAGEMENT', 'TASKS'],
  APPLE_HEALTH: ['HEALTH', 'ACTIVITY'],
  GOOGLE_FIT: ['HEALTH', 'ACTIVITY'],
  STRAVA: ['ACTIVITY'],
  SPOTIFY: ['AUDIO'],
  CUSTOM: [],
};

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  GOOGLE_CALENDAR: 'Google Calendar',
  NOTION: 'Notion',
  TODOIST: 'Todoist',
  TRELLO: 'Trello',
  APPLE_HEALTH: 'Apple Health',
  GOOGLE_FIT: 'Google Fit',
  STRAVA: 'Strava',
  SPOTIFY: 'Spotify',
  CUSTOM: 'Custom Integration',
};

// ============================================================================
// Calendar Sync
// ============================================================================

export type CalendarSyncDirection = 'READ' | 'WRITE' | 'BOTH';

export interface CalendarSyncWithRelations extends CalendarSync {
  user: Pick<User, 'id' | 'email'>;
}

export interface CreateCalendarSyncInput {
  provider: string;
  calendarId: string;
  calendarName: string;
  syncEnabled?: boolean;
  syncDirection?: CalendarSyncDirection;
}

export interface UpdateCalendarSyncInput {
  calendarName?: string;
  syncEnabled?: boolean;
  syncDirection?: CalendarSyncDirection;
}

export interface CreateCalendarSyncResponse {
  success: boolean;
  calendarSync?: CalendarSyncWithRelations;
  message?: string;
}

export interface UpdateCalendarSyncResponse {
  success: boolean;
  calendarSync?: CalendarSyncWithRelations;
  message?: string;
}

export interface SyncCalendarInput {
  calendarSyncId: string;
  from: string;
  to: string;
}

export interface CalendarEvent {
  id: string;
  externalId: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  color: string | null;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string;
  color?: string;
}

export interface CalendarConflict {
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  overlappingWith: Array<{
    id: string;
    title: string;
  }>;
}

// ============================================================================
// Locations
// ============================================================================

export interface LocationWithRelations extends Location {}

export interface CreateLocationInput {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  automationIds?: string[];
}

export interface UpdateLocationInput {
  name?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius?: number | null;
  automationIds?: string[];
}

export interface CreateLocationResponse {
  success: boolean;
  location?: LocationWithRelations;
  message?: string;
}

export interface UpdateLocationResponse {
  success: boolean;
  location?: LocationWithRelations;
  message?: string;
}

// ============================================================================
// Queries & Filters
// ============================================================================

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface IntegrationQueryParams {
  provider?: IntegrationProvider;
  isActive?: boolean;
  needsReauth?: boolean;
  sortBy?: 'provider' | 'createdAt' | 'lastSyncedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface IntegrationListResponse {
  success: boolean;
  integrations: IntegrationSafeView[];
  pagination: Pagination;
}

export interface CalendarSyncQueryParams {
  provider?: string;
  syncEnabled?: boolean;
}

export interface LocationQueryParams {
  search?: string;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Type Guards
// ============================================================================

export function isIntegrationSafeView(value: unknown): value is IntegrationSafeView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'provider' in value &&
    'isActive' in value &&
    'needsReauth' in value
  );
}

export function isCalendarSyncDirection(value: unknown): value is CalendarSyncDirection {
  return typeof value === 'string' && ['READ', 'WRITE', 'BOTH'].includes(value);
}

export function isIntegrationAuthState(value: unknown): value is IntegrationAuthState {
  return (
    typeof value === 'string' &&
    ['CONNECTED', 'EXPIRED', 'REVOKED', 'INVALID', 'NOT_CONNECTED'].includes(value)
  );
}