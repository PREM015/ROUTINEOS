import { auth } from '@/lib/auth';
import { apiKeyService } from '@/server/services/api-key.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const keys = await apiKeyService.listForUser(userIdFromSession(session));

    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    return handleError(error);
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
    const created = await apiKeyService.issue(userIdFromSession(session), body as {
      name: string;
      description?: string;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
