import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/goals/[id]/history
 * Fetch the progress history for the authenticated user's goal
 *
 * `offset` is now actually applied. It was previously parsed and echoed back in
 * `meta.offset` but never reached the query, so every page returned the same
 * first `limit` rows.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid goal id' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const requestedLimit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 100;
    const limit = Number.isFinite(requestedLimit) ? Math.min(requestedLimit, 200) : 100;
    const offset = searchParams.get('offset')
      ? parseInt(searchParams.get('offset')!, 10)
      : 0;

    const { history, goalTitle } = await new GoalService().getHistory(
      userIdFromSession(session),
      id,
      limit,
      offset
    );

    return NextResponse.json({
      success: true,
      data: history,
      meta: {
        goalId: id,
        goalTitle,
        total: history.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching goal history:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch goal history' }, { status: 500 });
  }
}
