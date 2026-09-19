import { auth } from '@/lib/auth';
import { IntegrationRepository } from '@/server/repositories/integration.repository';
import { connectIntegrationSchema } from '@/schemas/integration.schema';
import { getIntegrationConfig, INTEGRATIONS } from '@/lib/constants/integrations';
import {
  exchangeCode,
  getCallbackUrl,
  normalizeConnection,
  buildAuthUrl,
  IntegrationError,
} from '@/lib/integrations/manager';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Integrations Route
 * GET  /api/integrations – list the authenticated user's integrations
 * POST /api/integrations – connect a provider (OAuth code or API key)
 */

/**
 * GET /api/integrations
 * List all integrations for the user with provider display names.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integrationRepository = new IntegrationRepository();
    const integrations = await integrationRepository.findAll(session.user.id);

    const data = integrations.map(integration => ({
      ...normalizeConnection(integration),
      providerName: getIntegrationConfig(integration.provider).name,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
  }
}

/**
 * POST /api/integrations
 * Connect an integration provider. When an OAuth `code` is provided the token
 * is exchanged with the provider. API-key providers can supply `accessToken`
 * directly. Without credentials, OAuth providers return their auth URL.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = connectIntegrationSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { provider, code, redirectUri, accessToken, refreshToken, expiresAt } = validated.data;

    const config = INTEGRATIONS[provider];
    if (!config || !config.enabled) {
      return NextResponse.json(
        { error: `${provider} is not an enabled integration` },
        { status: 400 }
      );
    }

    const integrationRepository = new IntegrationRepository();

    let tokenResult:
      | { accessToken: string; refreshToken?: string; expiresAt?: Date }
      | undefined;

    if (code) {
      try {
        const exchanged = await exchangeCode(provider, {
          code,
          redirectUri: redirectUri ?? getCallbackUrl(provider),
        });
        tokenResult = {
          accessToken: exchanged.accessToken,
          refreshToken: exchanged.refreshToken ?? undefined,
          expiresAt: exchanged.expiresAt ?? undefined,
        };
      } catch (error) {
        if (error instanceof IntegrationError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 400 });
      }
    } else if (accessToken) {
      tokenResult = { accessToken, refreshToken, expiresAt };
    }

    if (!tokenResult) {
      if (config.authType === 'oauth') {
        const redirect = redirectUri ?? getCallbackUrl(provider);
        const authorizationUrl = buildAuthUrl(provider, redirect);
        return NextResponse.json({
          success: true,
          data: { requiresRedirect: true, authorizationUrl },
        });
      }
      return NextResponse.json(
        { error: 'accessToken is required to connect this provider' },
        { status: 400 }
      );
    }

    const integration = await integrationRepository.connect(provider, session.user.id, {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
    });

    return NextResponse.json(
      { success: true, data: normalizeConnection(integration) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error connecting integration:', error);
    if (error instanceof IntegrationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to connect integration' }, { status: 500 });
  }
}