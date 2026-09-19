import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SocialRepository } from '@/server/repositories/social.repository';

/**
 * GET /api/social/following
 * List the users the authenticated user follows with mutual-follow status.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new SocialRepository();
    const following = await repository.following(session.user.id);

    const enriched = await Promise.all(
      following.map(async (user) => ({
        ...user,
        isMutual: await repository.isFollowing(user.id, session.user.id),
      }))
    );

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { total: enriched.length },
    });
  } catch (error) {
    console.error('Error fetching following:', error);
    return NextResponse.json(
      { error: 'Failed to fetch following' },
      { status: 500 }
    );
  }
}