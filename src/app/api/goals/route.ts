import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { createGoalSchema } from '@/schemas/goal.schema';
import type { GoalPriority, GoalStatus, GoalType } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';

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

    const goals = await new GoalService().listGoals(session.user.id, {
      status: list('status') as GoalStatus[] | undefined,
      type: list('type') as GoalType[] | undefined,
      priority: list('priority') as GoalPriority[] | undefined,
      projectId: searchParams.get('projectId') || undefined,
      overdue: searchParams.get('overdue') === 'true',
      dueSoon: searchParams.get('dueSoon') === 'true',
      sortBy: searchParams.get('sortBy') || 'endDate',
      sortOrder: searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      dayTypeId: searchParams.get('dayTypeId') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { total: goals.length },
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
    const goal = await new GoalService().createGoal(session.user.id, {
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
