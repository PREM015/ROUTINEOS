import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { createGoalSchema } from '@/schemas/goal.schema';
import type { GoalPriority, GoalStatus, GoalType } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/goals
 * Fetch all goals for user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const list = (key: string) => searchParams.get(key)?.split(',').filter(Boolean);

    /**
     * `limit` is bounded here rather than left to the caller. The repository
     * clamps to 100 inside `buildPaginationQuery`, so a `limit=1000` request used
     * to be silently served as 100 rows and the client had no way to know. The
     * cap is now explicit and echoed back, and `hasMore` is computed from the
     * *requested* page size against the real total rather than the returned
     * length — otherwise a client could never tell "that was the last page" from
     * "there are more" and either double-fetch or truncate.
     */
    const parsedLimit = Number(searchParams.get('limit') ?? 50);
    const parsedOffset = Number(searchParams.get('offset') ?? 0);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(1, Math.trunc(parsedLimit)), 100)
      : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0;

    const filters = {
      status: list('status') as GoalStatus[] | undefined,
      type: list('type') as GoalType[] | undefined,
      priority: list('priority') as GoalPriority[] | undefined,
      projectId: searchParams.get('projectId') || undefined,
      overdue: searchParams.get('overdue') === 'true',
      dueSoon: searchParams.get('dueSoon') === 'true',
      sortBy: searchParams.get('sortBy') || 'endDate',
      sortOrder: searchParams.get('sortOrder') === 'desc' ? ('desc' as const) : ('asc' as const),
      dayTypeId: searchParams.get('dayTypeId') || undefined,
    };

    const service = new GoalService();
    // Both queries take the *same* filter object. Asking for the count with a
    // different filter than the page is how a total ends up describing a
    // different result set than the rows beside it.
    const [goals, total] = await Promise.all([
      service.listGoals(userIdFromSession(session), { ...filters, limit, offset }),
      service.countGoals(userIdFromSession(session), filters),
    ]);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: {
        // The real total, not `goals.length` — which was the length of the page
        // that happened to be returned, so every paged client silently
        // truncated at 50 with no signal.
        total,
        limit,
        offset,
        hasMore: offset + goals.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

/**
 * POST /api/goals
 * Create new goal
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createGoalSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // The service owns day-type assignment; the route just forwards validated input.
    const goal = await new GoalService().createGoal(userIdFromSession(session), {
      ...validated.data,
      appliesEveryDay: validated.data.appliesEveryDay ?? true,
    });

    if (!goal) {
      return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: goal }, { status: 201 });
  } catch (error) {
    console.error('Error creating goal:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
