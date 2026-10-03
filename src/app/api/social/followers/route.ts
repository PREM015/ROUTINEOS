import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/social/followers
 * List the authenticated user's followers with mutual-follow status.
 *
 * The per-row `isFollowing` call this used to make (one query per follower) is
 * now a set intersection against the caller's own following list — two queries
 * total instead of N+1.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enriched = await socialService.followers(userIdFromSession(session));

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
