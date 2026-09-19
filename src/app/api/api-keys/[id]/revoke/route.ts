import { auth } from '@/lib/auth';
import { ApiKeyRepository } from '@/server/repositories/api-key.repository';
import type { APIKey } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Project an APIKey row into a safe response shape with the key masked.
 */
function toSafeKey(key: APIKey) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    maskedKey: `••••••${key.keyHash.slice(-4)}`,
    isActive: key.isActive,
    scopes: key.scopes,
    rateLimit: key.rateLimit,
    usageCount: key.usageCount,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
  };
}

/**
 * POST /api/api-keys/[id]/revoke
 * Soft-revoke an API key owned by the authenticated user.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const repository = new ApiKeyRepository();
    const key = await repository.revoke(id, session.user.id);

    return NextResponse.json({ success: true, data: toSafeKey(key) });
  } catch (error) {
    console.error('Error revoking API key:', error);

    if (error instanceof Error && error.message === 'API key not found') {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}