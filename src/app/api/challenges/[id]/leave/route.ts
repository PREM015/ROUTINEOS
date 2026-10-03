import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { challengeService } from '@/server/services/challenge.service';
import { NotFoundError } from '@/lib/errors/app-error';
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
    console.error('Error leaving challenge:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to leave challenge' },
      { status: 500 }
    );
  }
}
