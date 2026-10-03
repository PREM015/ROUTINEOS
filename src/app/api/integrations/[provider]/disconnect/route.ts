import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
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
    console.error('Error disconnecting integration:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to disconnect integration' }, { status: 500 });
  }
}
