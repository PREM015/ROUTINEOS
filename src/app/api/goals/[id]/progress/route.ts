import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { checkGoalCompletion, markGoalComplete } from '@/lib/goals/completion';
import { Goal } from '@/types/goal';

const progressSchema = z.object({
  value: z.number(),
  note: z.string().optional(),
  recordedAt: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await request.json();
    const data = progressSchema.parse(json);

    const goal = await db.goal.findUnique({
      where: { id: params.id, userId: session.user.id },
    });

    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    const progress = await db.goalProgress.create({
      data: {
        goalId: params.id,
        value: data.value,
        note: data.note,
        date: data.recordedAt || new Date().toISOString(),
      },
    });

    // Update goal current value
    const updatedGoal = await db.goal.update({
      where: { id: params.id },
      data: { currentValue: data.value },
    });

    // Check completion
    if (checkGoalCompletion(updatedGoal as Goal)) {
      await db.goal.update({
        where: { id: params.id },
        data: markGoalComplete(updatedGoal as Goal),
      });
    }

    return NextResponse.json(progress, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to log progress' }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const progress = await db.goalProgress.findMany({
      where: { goalId: params.id, goal: { userId: session.user.id } },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(progress);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}
