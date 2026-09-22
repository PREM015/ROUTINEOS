import { auth } from '@/lib/auth';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const checkinSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  completed: z.boolean(),
});

/**
 * POST /api/goals/[id]/checkin
 * Per-day check-off for DAILY goals. Records a dated progress log and sets
 * the absolute current value (1 = done, 0 = not done).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = checkinSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalRepository = new GoalRepository();
    const goal = await goalRepository.findById(id, session.user.id);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    if (goal.type !== 'DAILY') {
      return NextResponse.json(
        { error: 'Daily check-in is only available for DAILY goals' },
        { status: 400 }
      );
    }

    const { date, completed } = validated.data;
    const value = completed ? 1 : 0;

    await goalRepository.addProgressLog({
      goal: { connect: { id } },
      value,
      note: completed ? 'daily-checkin:done' : 'daily-checkin:cleared',
      date: new Date(`${date}T00:00:00.000Z`),
    });

    const updated = await goalRepository.update(id, session.user.id, {
      currentValue: value,
      status: completed ? 'COMPLETED' : 'ACTIVE',
      completedAt: completed ? new Date() : null,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error saving goal check-in:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to save check-in' },
      { status: 500 }
    );
  }
}
