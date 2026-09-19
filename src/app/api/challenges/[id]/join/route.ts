import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ChallengeRepository } from '@/server/repositories/challenge.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/challenges/[id]/join
 * Join a challenge as the authenticated user.
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

    const repository = new ChallengeRepository();
    const challenge = await repository.getById(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const isMember = await repository.isMember(id, session.user.id);
    if (isMember) {
      return NextResponse.json(
        { error: 'You have already joined this challenge' },
        { status: 409 }
      );
    }

    const result = await repository.join(id, session.user.id);

    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error joining challenge:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to join challenge' },
      { status: 500 }
    );
  }
}