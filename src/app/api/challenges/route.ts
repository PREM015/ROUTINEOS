import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { ChallengeRepository } from '@/server/repositories/challenge.repository';
import { createChallengeSchema } from '@/schemas/challenge.schema';

/**
 * GET /api/challenges
 * List public challenges and challenges the user has joined.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new ChallengeRepository();
    const [active, joined] = await Promise.all([
      repository.listActive(),
      repository.listByUser(session.user.id),
    ]);

    const joinedIds = new Set(joined.map((challenge) => challenge.id));
    const byId = new Map<string, (typeof active)[number]>();

    for (const challenge of [...active, ...joined]) {
      const existing = byId.get(challenge.id);
      if (!existing) {
        byId.set(challenge.id, challenge);
      }
    }

    const data = Array.from(byId.values()).map((challenge) => {
      const withMeta = challenge as typeof challenge & {
        creator?: { id: string; name: string | null; displayName: string | null; avatarUrl: string | null };
        _count?: { members: number };
      };
      return {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        isPublic: challenge.isPublic,
        maxMembers: challenge.maxMembers,
        rules: challenge.rules,
        rewards: challenge.rewards,
        creator: withMeta.creator,
        memberCount: withMeta._count?.members ?? 0,
        isJoined: joinedIds.has(challenge.id),
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (error) {
    console.error('Error listing challenges:', error);
    return NextResponse.json(
      { error: 'Failed to list challenges' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/challenges
 * Create a new challenge as the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createChallengeSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const challenge = await new ChallengeRepository().create(
      session.user.id,
      validated.data
    );

    return NextResponse.json(
      { success: true, data: challenge },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json(
      { error: 'Failed to create challenge' },
      { status: 500 }
    );
  }
}