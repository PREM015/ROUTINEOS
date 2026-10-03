import { auth } from '@/lib/auth';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/users/leaderboard
 *
 * Ranked leaderboard rows, computed server-side.
 *
 * The client used to assemble this itself: it called `/api/users/search?q=`
 * (which rejects an empty query, so it always returned `[]`, leaving the page
 * permanently empty) and then issued one `/api/users/[id]/profile` request per
 * user. Those profile routes are rate limited to 30/min, so a single leaderboard
 * load consumed almost the whole budget and a reload would 429.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const windowParam = searchParams.get('windowDays');

    const limit = limitParam === null ? 25 : Number(limitParam);
    const windowDays = windowParam === null ? 90 : Number(windowParam);

    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: 'limit must be between 1 and 100' }, { status: 400 });
    }
    if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 365) {
      return NextResponse.json({ error: 'windowDays must be between 1 and 365' }, { status: 400 });
    }

    const rows = await new UserService().getLeaderboard(
      userIdFromSession(session),
      limit,
      windowDays
    );

    return NextResponse.json({
      success: true,
      data: rows,
      meta: { total: rows.length, limit, windowDays },
    });
  } catch (error) {
    console.error('Error loading leaderboard:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
