import { auth } from '@/lib/auth';
import type { IntegrationProvider } from '@prisma/client';
import { IntegrationRepository } from '@/server/repositories/integration.repository';
import { integrationUpdateSchema } from '@/schemas/integration.schema';
import { INTEGRATIONS, getIntegrationConfig } from '@/lib/constants/integrations';
import { normalizeConnection } from '@/lib/integrations/manager';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Integration by Provider Route
 * GET   /api/integrations/[provider] – fetch one integration
 * PATCH /api/integrations/[provider] – update isActive / tokens
 */

interface RouteContext {
  params: { provider: string };
}

function providerFromSlug(slug: string): IntegrationProvider | null {
  const normalized = slug.toLowerCase();
  const keys = Object.keys(INTEGRATIONS) as IntegrationProvider[];
  return keys.find(provider => provider.toLowerCase().replace(/_/g, '-') === normalized) ?? null;
}

/**
 * GET /api/integrations/[provider]
 * Fetch the user's connection for a single provider.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = providerFromSlug(params.provider);
    if (!provider) {
      return NextResponse.json({ error: 'Unknown integration provider' }, { status: 400 });
    }

    const integrationRepository = new IntegrationRepository();
    const integration = await integrationRepository.findByProvider(session.user.id, provider);

    if (!integration) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...normalizeConnection(integration),
        providerName: getIntegrationConfig(provider).name,
      },
    });
  } catch (error) {
    console.error('Error fetching integration:', error);
    return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 });
  }
}

/**
 * PATCH /api/integrations/[provider]
 * Update the connection status or stored tokens for a provider.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = providerFromSlug(params.provider);
    if (!provider) {
      return NextResponse.json({ error: 'Unknown integration provider' }, { status: 400 });
    }

    const body = await request.json();
    const validated = integrationUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const integrationRepository = new IntegrationRepository();
    const existing = await integrationRepository.findByProvider(session.user.id, provider);
    if (!existing) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 404 });
    }

    let integration = existing;
    if (validated.data.isActive !== undefined) {
      integration = await integrationRepository.updateStatus(
        session.user.id,
        existing.id,
        validated.data.isActive
      );
    }
    if (
      validated.data.accessToken !== undefined ||
      validated.data.refreshToken !== undefined ||
      validated.data.expiresAt !== undefined
    ) {
      integration = await integrationRepository.updateTokens(session.user.id, existing.id, {
        accessToken: validated.data.accessToken,
        refreshToken: validated.data.refreshToken,
        expiresAt: validated.data.expiresAt,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...normalizeConnection(integration),
        providerName: getIntegrationConfig(provider).name,
      },
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 });
  }
}