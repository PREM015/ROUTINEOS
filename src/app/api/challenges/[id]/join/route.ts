import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { challengeService } from '@/server/services/challenge.service';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/challenges/[id]/join
 * Join a challenge as the authenticated user.
 *
 * Already-a-member is a 409 and a missing challenge is a 404; both are decided in
 * the service now, and the messages are unchanged.
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

    const result = await challengeService.join(id, session.user.id);

    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error joining challenge:', error);

    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to join challenge' },
      { status: 500 }
    );
  }
}
