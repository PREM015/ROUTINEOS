import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SocialRepository } from '@/server/repositories/social.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { followUserSchema } from '@/schemas/social.schema';

/**
 * POST /api/social/follow
 * Follow another user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = followUserSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const targetId = validated.data.userId;
    if (targetId === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot follow yourself' },
        { status: 400 }
      );
    }

    const target = await new UserRepository().findById(targetId);
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const repository = new SocialRepository();
    const result = await repository.follow(session.user.id, targetId);
    if (!result.created) {
      return NextResponse.json(
        { error: 'You are already following this user' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: true, data: { following: true, connection: result.connection } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error following user:', error);
    return NextResponse.json(
      { error: 'Failed to follow user' },
      { status: 500 }
    );
  }
}