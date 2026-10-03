import { IntegrationRepository } from '@/server/repositories/integration.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { INTEGRATIONS, getIntegrationConfig } from '@/lib/constants/integrations';
import {
  buildAuthUrl,
  exchangeCode,
  getCallbackUrl,
  normalizeConnection,
} from '@/lib/integrations/manager';
import { listEvents } from '@/lib/integrations/google-calendar';
import type {
  ConnectIntegrationInput,
  IntegrationUpdateInput,
} from '@/schemas/integration.schema';
import type { Integration, IntegrationProvider } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

/**
 * Integration Service
 *
 * Owns provider resolution, the connect/sync/disconnect orchestration and the
 * "is this provider enabled" policy, all four of which used to be duplicated
 * across the routes (ERROR.md §1).
 *
 * The clearest example of what that duplication cost: `providerFromSlug` was
 * copy-pasted into all three `/api/integrations/[provider]/*` routes. Three
 * copies of the slug→enum mapping means the URL contract for "which providers
 * are reachable" is only as consistent as the last edit to any of them, and
 * nothing fails if one drifts — a provider that works under `/sync` can 400 as
 * "Unknown integration provider" under `/disconnect`.
 */
export class IntegrationService {
  private readonly integrationRepository: IntegrationRepository;

  constructor(
    integrationRepository: IntegrationRepository = new IntegrationRepository()
  ) {
    this.integrationRepository = integrationRepository;
  }

  /**
   * Map a URL slug to a provider enum value.
   *
   * Accepts `google_calendar`, `google-calendar` and `GoogleCalendar` alike. The
   * underscore/hyphen normalisation is what lets a caller use the enum value
   * directly in a URL without it being a second, differently-spelled identifier.
   *
   * Throws `ValidationError` for an unknown provider, which the routes map to
   * their existing 400.
   */
  providerFromSlug(slug: string): IntegrationProvider {
    const normalized = slug.toLowerCase();
    const keys = Object.keys(INTEGRATIONS) as IntegrationProvider[];
    const provider =
      keys.find(
        (key) => key.toLowerCase().replace(/_/g, '-') === normalized
      ) ?? null;

    if (!provider) {
      throw new ValidationError('Unknown integration provider');
    }
    return provider;
  }

  /**
   * The user's connections, with a display name attached.
   *
   * `normalizeConnection` is applied here rather than per route so the shape a
   * client sees cannot differ between the list, the single-fetch and the
   * connect response.
   */
  async listForUser(userId: UserId) {
    const integrations = await this.integrationRepository.findAll(userId);

    return integrations.map((integration) => ({
      ...normalizeConnection(integration),
      providerName: getIntegrationConfig(integration.provider).name,
    }));
  }

  /** One provider's connection, or `NotFoundError`. */
  async getForUser(userId: UserId, provider: IntegrationProvider) {
    const integration = await this.integrationRepository.findByProvider(
      userId,
      provider
    );
    if (!integration) {
      throw new NotFoundError('Integration');
    }

    return {
      ...normalizeConnection(integration),
      providerName: getIntegrationConfig(provider).name,
    };
  }

  /**
   * Connect a provider.
   *
   * Three distinct outcomes, which the route previously had to distinguish by
   * inspecting the return value:
   *
   *  - an OAuth provider called with no code returns an authorization URL
   *  - a token-bearing provider (OAuth code, or a raw API key) is persisted
   *  - a provider that needs credentials but was given none is a 400
   */
  async connect(
    userId: UserId,
    input: ConnectIntegrationInput
  ): Promise<
    | { requiresRedirect: true; authorizationUrl: string }
    | ReturnType<typeof normalizeConnection>
  > {
    const { provider, code, redirectUri, accessToken, refreshToken, expiresAt } =
      input;

    const config = INTEGRATIONS[provider];
    if (!config || !config.enabled) {
      throw new ValidationError(
        `${provider} is not an enabled integration`
      );
    }

    let tokenResult:
      | { accessToken: string; refreshToken?: string; expiresAt?: Date }
      | undefined;

    if (code) {
      const exchanged = await exchangeCode(provider, {
        code,
        redirectUri: redirectUri ?? getCallbackUrl(provider),
      });
      tokenResult = {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken ?? undefined,
        expiresAt: exchanged.expiresAt ?? undefined,
      };
    } else if (accessToken) {
      tokenResult = { accessToken, refreshToken, expiresAt };
    }

    if (!tokenResult) {
      if (config.authType === 'oauth') {
        const redirect = redirectUri ?? getCallbackUrl(provider);
        return {
          requiresRedirect: true,
          authorizationUrl: buildAuthUrl(provider, redirect),
        };
      }
      throw new ValidationError(
        'accessToken is required to connect this provider'
      );
    }

    const integration = await this.integrationRepository.connect(
      userId,
      provider as IntegrationProvider,
      {
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt: tokenResult.expiresAt,
      }
    );

    return normalizeConnection(integration);
  }

  /**
   * Apply an update to a connection.
   *
   * Status and tokens are applied in that order, and only when present, so a
   * request that changes one does not silently reset the other.
   */
  async update(
    userId: UserId,
    provider: IntegrationProvider,
    input: IntegrationUpdateInput
  ) {
    const existing = await this.integrationRepository.findByProvider(
      userId,
      provider
    );
    if (!existing) {
      throw new NotFoundError('Integration');
    }

    let integration: Integration = existing;
    if (input.isActive !== undefined) {
      integration = await this.integrationRepository.updateStatus(
        userId,
        existing.id,
        input.isActive
      );
    }
    if (
      input.accessToken !== undefined ||
      input.refreshToken !== undefined ||
      input.expiresAt !== undefined
    ) {
      integration = await this.integrationRepository.updateTokens(
        userId,
        existing.id,
        {
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt: input.expiresAt,
        }
      );
    }

    return {
      ...normalizeConnection(integration),
      providerName: getIntegrationConfig(provider).name,
    };
  }

  /**
   * Deactivate a connection.
   *
   * Tokens are left on the row and the record is not deleted, so reconnecting
   * does not require the provider to re-authorise from scratch.
   */
  async disconnect(userId: UserId, provider: IntegrationProvider) {
    const integration = await this.integrationRepository.findByProvider(
      userId,
      provider
    );
    if (!integration) {
      throw new NotFoundError('Integration');
    }

    await this.integrationRepository.disconnect(userId, integration.id);

    return { provider, isActive: false as const };
  }

  /**
   * Trigger a sync.
   *
   * Google Calendar performs a live read and reports how many events it saw; other
   * providers only record that a sync happened, which is why `synced` is 0 for
   * them rather than being omitted — the client can tell "synced, nothing to
   * import" from "not synced".
   *
   * An **inactive** connection is a `NotFoundError` here, matching the previous
   * combined `!integration || !integration.isActive` 404. They are reported
   * identically on purpose: telling a stranger which providers a user has
   * connected even if disabled is information the API should not hand out.
   */
  async sync(userId: UserId, provider: IntegrationProvider) {
    const integration = await this.integrationRepository.findByProvider(
      userId,
      provider
    );

    if (!integration || !integration.isActive) {
      throw new NotFoundError('Integration');
    }

    let synced = 0;
    let message = `Synced ${provider}`;

    if (provider === 'GOOGLE_CALENDAR' && integration.accessToken) {
      const now = new Date();
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const events = await listEvents(
        { accessToken: integration.accessToken },
        { timeMin: monthAgo, timeMax: now, maxResults: 500, singleEvents: true }
      );
      synced = events.length;
      message = `Synced ${events.length} Google Calendar event${
        events.length === 1 ? '' : 's'
      }`;
    }

    await this.integrationRepository.updateStatus(userId, integration.id, true);

    return { provider, synced, message, syncedAt: new Date() };
  }
}

export const integrationService = new IntegrationService();
