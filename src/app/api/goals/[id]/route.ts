import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { updateGoalSchema } from '@/schemas/goal.schema';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const goalRepository = new GoalRepository();
    const goal = await goalRepository.findWithRelations(params.id, session.user.id);

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('Error fetching goal:', error);
    return NextResponse.json({ error: 'Failed to fetch goal' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateGoalSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const goal = await goalService.updateGoal(
      session.user.id,
      params.id,
      validated.data
    );

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('Error updating goal:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const goalService = new GoalService();
    await goalService.deleteGoal(session.user.id, params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}