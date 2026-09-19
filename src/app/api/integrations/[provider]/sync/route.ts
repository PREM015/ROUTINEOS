import { auth } from '@/lib/auth';
import type { IntegrationProvider } from '@prisma/client';
import { IntegrationRepository } from '@/server/repositories/integration.repository';
import { INTEGRATIONS } from '@/lib/constants/integrations';
import { listEvents } from '@/lib/integrations/google-calendar';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Integration Sync Route
 * POST /api/integrations/[provider]/sync – trigger a sync for the provider
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
 * POST /api/integrations/[provider]/sync
 * Trigger a sync. Google Calendar performs a live read (counting events in the
 * last 30 days); other providers record a sync status update.
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

    if (!integration || !integration.isActive) {
      return NextResponse.json(
        { error: 'Integration is not connected or is inactive' },
        { status: 404 }
      );
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
      message = `Synced ${events.length} Google Calendar event${events.length === 1 ? '' : 's'}`;
    }

    await integrationRepository.updateStatus(session.user.id, integration.id, true);

    return NextResponse.json({
      success: true,
      data: {
        provider,
        synced,
        message,
        syncedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error syncing integration:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to sync integration' }, { status: 500 });
  }
}