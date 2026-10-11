import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { userIdFromSession } from '@/types/ids';

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
    const data = await integrationService.sync(userIdFromSession(session), provider);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
