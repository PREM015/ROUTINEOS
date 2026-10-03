import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { integrationUpdateSchema } from '@/schemas/integration.schema';

/**
 * Integration by Provider Route
 * GET   /api/integrations/[provider] – fetch one integration
 * PATCH /api/integrations/[provider] – update isActive / tokens
 *
 * The slug→enum mapping that used to be copy-pasted into all three
 * `/[provider]/*` routes is now `IntegrationService.providerFromSlug`, so the set
 * of reachable providers cannot differ between them.
 */

interface RouteContext {
  params: Promise<{ provider: string }>;
}

/**
 * GET /api/integrations/[provider]
 * Fetch the user's connection for a single provider.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { provider: paramProvider } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = integrationService.providerFromSlug(paramProvider);
    const data = await integrationService.getForUser(session.user.id, provider);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching integration:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 });
  }
}

/**
 * PATCH /api/integrations/[provider]
 * Update the connection status or stored tokens for a provider.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { provider: paramProvider } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = integrationService.providerFromSlug(paramProvider);

    const body = await request.json();
    const validated = integrationUpdateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await integrationService.update(
      session.user.id,
      provider,
      validated.data
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating integration:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Integration not connected' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update integration' }, { status: 500 });
  }
}
