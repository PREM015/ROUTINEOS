import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ChallengeRepository } from '@/server/repositories/challenge.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/challenges/[id]/leave
 * Leave a challenge the authenticated user has joined.
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
    const isMember = await repository.isMember(id, session.user.id);
    if (!isMember) {
      return NextResponse.json(
        { error: 'You have not joined this challenge' },
        { status: 404 }
      );
    }

    const left = await repository.leave(id, session.user.id);

    return NextResponse.json({ success: true, data: { left } });
  } catch (error) {
    console.error('Error leaving challenge:', error);
    return NextResponse.json(
      { error: 'Failed to leave challenge' },
      { status: 500 }
    );
  }
}