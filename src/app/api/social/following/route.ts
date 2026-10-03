import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/social/following
 * List the users the authenticated user follows with mutual-follow status.
 *
 * Two queries total: the N+1 `isFollowing` per row this used to issue is now a
 * set intersection against the caller's follower list.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enriched = await socialService.following(userIdFromSession(session));

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
