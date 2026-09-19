import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ChallengeRepository } from '@/server/repositories/challenge.repository';
import { updateChallengeProgressSchema } from '@/schemas/challenge.schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/challenges/[id]
 * Fetch a single challenge with membership details.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
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
    if (!challenge.isPublic && !isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...challenge,
        isJoined: isMember,
        isCreator: challenge.creatorId === session.user.id,
      },
    });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    return NextResponse.json(
      { error: 'Failed to fetch challenge' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/challenges/[id]
 * Update the authenticated user's progress in a challenge.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateChallengeProgressSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new ChallengeRepository();
    const challenge = await repository.getById(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const isMember = await repository.isMember(id, session.user.id);
    if (!isMember) {
      return NextResponse.json(
        { error: 'Join the challenge to update progress' },
        { status: 403 }
      );
    }

    const result = await repository.setProgress(id, session.user.id, validated.data.progress);
    if (!result) {
      return NextResponse.json({ error: 'Challenge participant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating challenge progress:', error);
    return NextResponse.json(
      { error: 'Failed to update challenge progress' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/challenges/[id]
 * Delete a challenge the authenticated user created.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
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

    if (challenge.creatorId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the challenge creator can delete it' },
        { status: 403 }
      );
    }

    const deleted = await repository.delete(id, session.user.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting challenge:', error);
    return NextResponse.json(
      { error: 'Failed to delete challenge' },
      { status: 500 }
    );
  }
}