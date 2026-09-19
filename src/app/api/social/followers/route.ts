import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SocialRepository } from '@/server/repositories/social.repository';

/**
 * GET /api/social/followers
 * List the authenticated user's followers with mutual-follow status.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new SocialRepository();
    const followers = await repository.followers(session.user.id);

    const enriched = await Promise.all(
      followers.map(async (follower) => ({
        ...follower,
        isMutual: await repository.isFollowing(session.user.id, follower.id),
      }))
    );

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { total: enriched.length },
    });
  } catch (error) {
    console.error('Error fetching followers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch followers' },
      { status: 500 }
    );
  }
}