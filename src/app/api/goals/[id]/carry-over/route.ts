import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const carryOverSchema = z.object({
  newEndDate: z.coerce.date(),
  adjustProgress: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = carryOverSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const newGoal = await goalService.carryOverGoal(
      session.user.id,
      params.id,
      validated.data.newEndDate,
      validated.data.adjustProgress
    );

    return NextResponse.json({ success: true, data: newGoal });
  } catch (error) {
    console.error('Error carrying over goal:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to carry over goal' },
      { status: 500 }
    );
  }
}