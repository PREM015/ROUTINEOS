import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { challengeService } from '@/server/services/challenge.service';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/challenges/[id]/leave
 * Leave a challenge the authenticated user has joined.
 *
 * Not-a-member is a 404, unchanged — it refers to the caller's own membership
 * row rather than to a conflicting state.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge id' }, { status: 400 });
    }

    const left = await challengeService.leave(id, userIdFromSession(session));

    return NextResponse.json({ success: true, data: { left } });
  } catch (error) {
    return handleError(error);
  }
}
