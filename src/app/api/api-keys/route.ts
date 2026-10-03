import { auth } from '@/lib/auth';
import { apiKeyService } from '@/server/services/api-key.service';
import { ValidationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user (masked).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await apiKeyService.listForUser(session.user.id);

    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    console.error('Error fetching API keys:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Create a new API key. The raw key is returned exactly once; only its
 * hash is persisted.
 *
 * Key generation, hashing and the safe projection all live in
 * `ApiKeyService.issue` — issuing and verifying must share `hashApiKey`, and the
 * projection decides what leaves the server, so neither belongs in a handler.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const created = await apiKeyService.issue(session.user.id, body as {
      name: string;
      description?: string;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('Error creating API key:', error);

    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
