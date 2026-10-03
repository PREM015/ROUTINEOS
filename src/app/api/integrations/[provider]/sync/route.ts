import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

/**
 * Integration Sync Route
 * POST /api/integrations/[provider]/sync – trigger a sync for the provider
 */

interface RouteContext {
  params: Promise<{ provider: string }>;
}

/**
 * POST /api/integrations/[provider]/sync
 * Trigger a sync. Google Calendar performs a live read (counting events in the
 * last 30 days); other providers record a sync status update.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { provider: paramProvider } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = integrationService.providerFromSlug(paramProvider);
    const data = await integrationService.sync(session.user.id, provider);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error syncing integration:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: 'Integration is not connected or is inactive' },
        { status: 404 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to sync integration' }, { status: 500 });
  }
}
