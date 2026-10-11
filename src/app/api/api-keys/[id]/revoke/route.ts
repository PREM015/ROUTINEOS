import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { apiKeyService } from '@/server/services/api-key.service';
import type { APIKey } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * API Key Revoke Route
 * POST /api/api-keys/[id]/revoke
 *
 * Idempotent: revoking an already-revoked key returns it unchanged.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

    const key = await apiKeyService.revoke(userIdFromSession(session), id);
    return NextResponse.json({
      success: true,
      data: {
        id: (key as APIKey).id,
        isActive: (key as APIKey).isActive,
        revokedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
