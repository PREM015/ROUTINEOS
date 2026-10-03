import { auth } from '@/lib/auth';
import { apiKeyService } from '@/server/services/api-key.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { APIKey } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * API Key by ID Route
 * GET    /api/api-keys/[id]
 * PATCH  /api/api-keys/[id]
 * DELETE /api/api-keys/[id]
 *
 * Thin handler: ownership checks live in `ApiKeyService`.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Project an APIKey row into a safe response shape.
 *
 * The raw key is never stored, so there is nothing to mask. `keyFingerprint` is
 * the first 8 characters of the *hash*, shown only so the UI can tell keys
 * apart; it is not derived from the secret.
 */
function toSafeKey(key: APIKey) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    keyFingerprint: key.keyHash.slice(0, 8),
    maskedKey: `••••••••${key.keyHash.slice(-4)}`,
    isActive: key.isActive,
    scopes: key.scopes,
    rateLimit: key.rateLimit,
    usageCount: key.usageCount,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const key = await apiKeyService.get(userIdFromSession(session), id);
    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toSafeKey(key) });
  } catch (error) {
    console.error('Error fetching API key:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch API key' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const body = await request.json();
    const updated = await apiKeyService.update(userIdFromSession(session), id, body);

    return NextResponse.json({ success: true, data: toSafeKey(updated) });
  } catch (error) {
    console.error('Error updating API key:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const result = await apiKeyService.remove(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting API key:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}
