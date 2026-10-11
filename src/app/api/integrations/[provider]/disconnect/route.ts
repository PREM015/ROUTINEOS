import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { userIdFromSession } from '@/types/ids';

/**
 * Integration Disconnect Route
 * POST /api/integrations/[provider]/disconnect – deactivate an integration
 */

interface RouteContext {
  params: Promise<{ provider: string }>;
}

/**
 * POST /api/integrations/[provider]/disconnect
 * Deactivate the user's connection for the provider.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { provider: paramProvider } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = integrationService.providerFromSlug(paramProvider);
    const result = await integrationService.disconnect(userIdFromSession(session), provider);

    return NextResponse.json({
      success: true,
      data: { ...result, message: 'Integration disconnected' },
    });
  } catch (error) {
    return handleError(error);
  }
}
