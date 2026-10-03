import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { integrationService } from '@/server/services/integration.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { connectIntegrationSchema } from '@/schemas/integration.schema';
import { IntegrationError } from '@/lib/integrations/manager';
import { userIdFromSession } from '@/types/ids';

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

    const data = await integrationService.listForUser(userIdFromSession(session));

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

    const data = await integrationService.connect(userIdFromSession(session), validated.data);

    // A provider with no credentials returns an authorization URL rather than a
    // stored connection, so this is a 200 and not a 201.
    const created = !('requiresRedirect' in data);
    return NextResponse.json({ success: true, data }, { status: created ? 201 : 200 });
  } catch (error) {
    console.error('Error connecting integration:', error);
    if (error instanceof IntegrationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to connect integration' }, { status: 500 });
  }
}
