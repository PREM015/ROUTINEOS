import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { createGoalSchema } from '@/schemas/goal.schema';
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

    const goalRepository = new GoalRepository();
    const goals = await goalRepository.findAll(session.user.id, {
      status: searchParams.get('status')?.split(',') as any,
      type: searchParams.get('type')?.split(',') as any,
      priority: searchParams.get('priority')?.split(',') as any,
      projectId: searchParams.get('projectId') || undefined,
      overdue: searchParams.get('overdue') === 'true',
      dueSoon: searchParams.get('dueSoon') === 'true',
      sortBy: (searchParams.get('sortBy') as any) || 'endDate',
      sortOrder: (searchParams.get('sortOrder') as any) || 'asc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
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

    const goalService = new GoalService();
    const goal = await goalService.createGoal(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: goal }, { status: 201 });
  } catch (error) {
    console.error('Error creating goal:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}