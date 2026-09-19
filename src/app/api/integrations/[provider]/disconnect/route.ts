import { auth } from '@/lib/auth';
import type { IntegrationProvider } from '@prisma/client';
import { IntegrationRepository } from '@/server/repositories/integration.repository';
import { INTEGRATIONS } from '@/lib/constants/integrations';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Integration Disconnect Route
 * POST /api/integrations/[provider]/disconnect – deactivate an integration
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
 * POST /api/integrations/[provider]/disconnect
 * Deactivate the user's connection for the provider.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
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

    await integrationRepository.disconnect(session.user.id, integration.id);

    return NextResponse.json({
      success: true,
      data: { provider, isActive: false, message: 'Integration disconnected' },
    });
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to disconnect integration' }, { status: 500 });
  }
}