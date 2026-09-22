import type { Integration, IntegrationProvider } from '@prisma/client';
import {
  INTEGRATIONS,
  getIntegrationConfig,
} from '@/lib/constants/integrations';
import type {
  IntegrationSafeView,
  OAuthConfig,
  TokenExchangeResult,
} from '@/types/integrations';

/**
 * Integration connection manager.
 * Shared OAuth plumbing: provider validation, authorization URLs, token
 * exchange, and normalization of stored connections.
 */

const AUTH_ENDPOINTS: Partial<Record<IntegrationProvider, string>> = {
  GOOGLE_CALENDAR: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_FIT: 'https://accounts.google.com/o/oauth2/v2/auth',
  NOTION: 'https://api.notion.com/v1/oauth/authorize',
  TODOIST: 'https://todoist.com/oauth/authorize',
  STRAVA: 'https://www.strava.com/oauth/authorize',
  SPOTIFY: 'https://accounts.spotify.com/authorize',
};

const TOKEN_ENDPOINTS: Partial<Record<IntegrationProvider, string>> = {
  GOOGLE_CALENDAR: 'https://oauth2.googleapis.com/token',
  GOOGLE_FIT: 'https://oauth2.googleapis.com/token',
  NOTION: 'https://api.notion.com/v1/oauth/token',
  TODOIST: 'https://todoist.com/oauth/access_token',
  STRAVA: 'https://www.strava.com/oauth/token',
  SPOTIFY: 'https://accounts.spotify.com/api/token',
};

const PROVIDER_SCOPES: Partial<Record<IntegrationProvider, readonly string[]>> = {
  GOOGLE_CALENDAR: ['https://www.googleapis.com/auth/calendar'],
  GOOGLE_FIT: [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.body.read',
  ],
  NOTION: [],
  TODOIST: ['data:read', 'data:read_write'],
  STRAVA: ['activity:read', 'activity:read_all', 'profile:read_all'],
  SPOTIFY: ['user-read-currently-playing', 'user-read-recently-played'],
};

const CLIENT_ID_FALLBACKS: Partial<Record<IntegrationProvider, string>> = {
  GOOGLE_CALENDAR: 'GOOGLE_CLIENT_ID',
  GOOGLE_FIT: 'GOOGLE_CLIENT_ID',
  NOTION: 'NOTION_CLIENT_ID',
  TODOIST: 'TODOIST_CLIENT_ID',
  STRAVA: 'STRAVA_CLIENT_ID',
  SPOTIFY: 'SPOTIFY_CLIENT_ID',
};

export class IntegrationError extends Error {
  readonly provider: IntegrationProvider;

  constructor(provider: IntegrationProvider, message: string) {
    super(message);
    this.name = 'IntegrationError';
    this.provider = provider;
  }
}

export class IntegrationTokenError extends IntegrationError {
  constructor(provider: IntegrationProvider, message: string = 'Access token exchange failed') {
    super(provider, message);
    this.name = 'IntegrationTokenError';
  }
}

/**
 * The providers currently enabled in the integration registry.
 */
export function getProviders(): IntegrationProvider[] {
  return Object.values(INTEGRATIONS)
    .filter(config => config.enabled)
    .map(config => config.provider);
}

/**
 * Whether an arbitrary value is a known `IntegrationProvider`.
 */
export function validateProvider(value: unknown): value is IntegrationProvider {
  return typeof value === 'string' && value in INTEGRATIONS;
}

function clientIdEnvName(provider: IntegrationProvider): string {
  return `INTEGRATION_${provider}_CLIENT_ID`;
}

function clientSecretEnvName(provider: IntegrationProvider): string {
  return `INTEGRATION_${provider}_CLIENT_SECRET`;
}

function getClientId(provider: IntegrationProvider): string {
  const direct = process.env[clientIdEnvName(provider)];
  if (direct && direct.length > 0) return direct;
  const fallback = CLIENT_ID_FALLBACKS[provider];
  if (fallback) {
    const value = process.env[fallback];
    if (value && value.length > 0) return value;
  }
  const name = getIntegrationConfig(provider).name;
  throw new IntegrationError(
    provider,
    `${name} is not configured (set ${clientIdEnvName(provider)} or the provider fallback env var)`
  );
}

function getClientSecret(provider: IntegrationProvider): string {
  const direct = process.env[clientSecretEnvName(provider)];
  if (direct && direct.length > 0) return direct;
  if (provider === 'NOTION') {
    const value = process.env.NOTION_INTEGRATION_SECRET;
    if (value && value.length > 0) return value;
  }
  throw new IntegrationError(
    provider,
    `Client secret for ${getIntegrationConfig(provider).name} is not configured (set ${clientSecretEnvName(provider)})`
  );
}

/**
 * Build the `OAuthConfig` for a provider, asserting it uses OAuth.
 */
export function getOAuthConfig(provider: IntegrationProvider): OAuthConfig {
  const config = getIntegrationConfig(provider);
  if (config.authType !== 'oauth') {
    throw new IntegrationError(provider, `${config.name} does not use OAuth`);
  }
  const authorizationEndpoint = AUTH_ENDPOINTS[provider];
  const tokenEndpoint = TOKEN_ENDPOINTS[provider];
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new IntegrationError(provider, `${config.name} has no configured OAuth endpoints`);
  }
  return {
    provider,
    clientId: getClientId(provider),
    scopes: [...(PROVIDER_SCOPES[provider] ?? config.scopes)],
    authorizationEndpoint,
    tokenEndpoint,
  };
}

/**
 * Base redirect URI for an OAuth callback. Configurable via
 * `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL`, defaulting to localhost:3000.
 */
export function getCallbackUrl(provider: IntegrationProvider): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000';
  const slug = provider.toLowerCase().replace(/_/g, '-');
  return `${base.replace(/\/$/, '')}/api/integrations/${slug}/callback`;
}

export interface OAuthAuthorizeParams {
  state?: string;
  scopes?: readonly string[];
  /** Google only: short-lived online access when omitted. */
  accessType?: 'online' | 'offline';
  loginHint?: string;
}

/**
 * Build a provider authorization URL. Throws when the provider is not an OAuth
 * provider or its client id is not configured.
 * @example
 * buildAuthUrl('GOOGLE_CALENDAR', 'https://app.example.com/callback', { accessType: 'offline' })
 */
export function buildAuthUrl(
  provider: IntegrationProvider,
  redirectUri: string,
  params: OAuthAuthorizeParams = {}
): string {
  const oauth = getOAuthConfig(provider);
  const url = new URL(oauth.authorizationEndpoint);
  url.searchParams.set('client_id', oauth.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  const scopes = params.scopes ?? oauth.scopes;
  url.searchParams.set('scope', scopes.join(' '));
  if (params.state) url.searchParams.set('state', params.state);
  if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);

  if (provider === 'GOOGLE_CALENDAR' || provider === 'GOOGLE_FIT') {
    url.searchParams.set('access_type', params.accessType ?? 'offline');
    url.searchParams.set('prompt', 'consent');
  }
  if (provider === 'NOTION') {
    url.searchParams.set('owner', 'user');
  }
  return url.toString();
}

export interface TokenExchangeParams {
  code: string;
  redirectUri?: string;
}

/**
 * Exchange an authorization code for tokens. `expiresAt` is derived from the
 * provider's `expires_in` response when present, otherwise `null` (the token
 * does not expire).
 *
 * Throws `IntegrationTokenError` for unsupported providers or HTTP errors.
 */
export async function exchangeCode(
  provider: IntegrationProvider,
  params: TokenExchangeParams
): Promise<TokenExchangeResult> {
  const oauth = getOAuthConfig(provider);
  const tokenEndpoint = TOKEN_ENDPOINTS[provider];
  if (!tokenEndpoint) {
    throw new IntegrationError(provider, `${getIntegrationConfig(provider).name} has no token endpoint`);
  }

  const redirectUri = params.redirectUri ?? getCallbackUrl(provider);
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: redirectUri,
    client_id: oauth.clientId,
  };

  if (provider === 'NOTION') {
    const basic = Buffer.from(
      `${oauth.clientId}:${getClientSecret(provider)}`
    ).toString('base64');
    headers.Authorization = `Basic ${basic}`;
    delete body.client_id;
  } else {
    body.client_secret = getClientSecret(provider);
  }

  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw new IntegrationTokenError(
      provider,
      'Network error while exchanging authorization code'
    );
  }

  if (!response.ok) {
    throw new IntegrationTokenError(
      provider,
      `Token endpoint responded with HTTP ${response.status}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = String(data.access_token ?? '');
  if (accessToken.length === 0) {
    throw new IntegrationTokenError(provider, 'Token endpoint returned no access_token');
  }

  const refreshToken =
    typeof data.refresh_token === 'string' && data.refresh_token.length > 0
      ? data.refresh_token
      : null;
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : null;
  const expiresAt =
    expiresIn !== null ? new Date(Date.now() + expiresIn * 1000) : null;
  const scope =
    typeof data.scope === 'string' && data.scope.length > 0
      ? data.scope.split(/\s+/).filter(Boolean)
      : [];

  return { accessToken, refreshToken, expiresAt, scope };
}

export interface ConnectionSnapshot {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Normalize an exchanged token result into a storable connection snapshot.
 * Keeps every field serializable so it can be archived or transmitted safely.
 */
export function normalizeTokenResult(
  provider: IntegrationProvider,
  result: TokenExchangeResult
): ConnectionSnapshot {
  return {
    provider,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    scopes: result.scope,
  };
}

/**
 * Read the `scopes` array out of an integration's JSON `settings` blob.
 */
function parseSettingsScopes(settings: string | null): string[] {
  if (!settings) return [];
  try {
    const parsed = JSON.parse(settings) as { scopes?: unknown };
    if (Array.isArray(parsed.scopes)) {
      return parsed.scopes.filter((scope): scope is string => typeof scope === 'string');
    }
  } catch {
    // Ignore malformed settings blobs.
  }
  return [];
}

/**
 * Normalize a persisted `Integration` row into the safe client-facing view,
 * deriving `needsReauth` from token expiry.
 */
export function normalizeConnection(
  integration: Pick<
    Integration,
    'id' | 'provider' | 'isActive' | 'settings' | 'lastSyncedAt' | 'syncError' | 'createdAt' | 'expiresAt'
  >,
  now: Date = new Date()
): IntegrationSafeView {
  const needsReauth =
    integration.isActive &&
    integration.expiresAt !== null &&
    integration.expiresAt.getTime() <= now.getTime();

  return {
    id: integration.id,
    provider: integration.provider,
    isActive: integration.isActive,
    scopes: parseSettingsScopes(integration.settings),
    lastSyncedAt: integration.lastSyncedAt,
    syncError: integration.syncError,
    connectedAt: integration.createdAt,
    expiresAt: integration.expiresAt,
    needsReauth,
  };
}