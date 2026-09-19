import { auth } from '@/lib/auth';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/goals/[id]/history
 * Fetch the progress history for the authenticated user's goal
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

    const goalRepository = new GoalRepository();
    const userId = session.user.id;

    const goal = await goalRepository.findById(id, userId);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const history = await goalRepository.getProgressHistory(id, limit);

    return NextResponse.json({
      success: true,
      data: history,
      meta: {
        goalId: id,
        goalTitle: goal.title,
        total: history.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching goal history:', error);
    return NextResponse.json({ error: 'Failed to fetch goal history' }, { status: 500 });
  }
}