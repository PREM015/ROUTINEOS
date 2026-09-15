import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { createCarryOverGoal } from '@/lib/goals/carry-over';
import { Goal } from '@/types/goal';

const carryOverSchema = z.object({
  newDueDate: z.string(),
  adjustedTargetValue: z.number().optional(),
  note: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await request.json();
    const data = carryOverSchema.parse(json);

    const oldGoal = await db.goal.findUnique({
      where: { id: params.id, userId: session.user.id },
    });

    if (!oldGoal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    const newGoalData = createCarryOverGoal(oldGoal as Goal, data.newDueDate);
    
    // Create new goal
    const newGoal = await db.goal.create({
      data: {
        ...newGoalData,
        targetValue: data.adjustedTargetValue ?? oldGoal.targetValue,
      },
    });

    // Close old goal
    await db.goal.update({
      where: { id: params.id },
      data: { status: 'ABANDONED', note: data.note || 'Carried over' },
    });

    return NextResponse.json(newGoal, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to carry over goal' }, { status: 500 });
  }
}
