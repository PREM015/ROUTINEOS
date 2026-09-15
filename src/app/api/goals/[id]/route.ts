import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const updateGoalSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']).optional(),
  dueDate: z.string().optional(),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const goal = await db.goal.findUnique({
      where: { id: params.id, userId: session.user.id },
      include: { progress: true },
    });

    if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch goal' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await request.json();
    const data = updateGoalSchema.parse(json);

    const goal = await db.goal.update({
      where: { id: params.id, userId: session.user.id },
      data,
    });

    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await db.goal.delete({
      where: { id: params.id, userId: session.user.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
