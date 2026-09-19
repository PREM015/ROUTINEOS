import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SocialRepository } from '@/server/repositories/social.repository';
import { followUserSchema } from '@/schemas/social.schema';

/**
 * POST /api/social/unfollow
 * Stop following another user.
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
        { error: 'You cannot unfollow yourself' },
        { status: 400 }
      );
    }

    const repository = new SocialRepository();
    const following = await repository.isFollowing(session.user.id, targetId);
    if (!following) {
      return NextResponse.json(
        { error: 'You are not following this user' },
        { status: 404 }
      );
    }

    await repository.unfollow(session.user.id, targetId);

    return NextResponse.json({ success: true, data: { following: false } });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return NextResponse.json(
      { error: 'Failed to unfollow user' },
      { status: 500 }
    );
  }
}