import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const progressSchema = z.object({
  value: z.number(),
  note: z.string().optional(),
  autoComplete: z.boolean().optional(),
});

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
    const validated = progressSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const result = await goalService.updateProgress(
      session.user.id,
      id,
      validated.data.value,
      validated.data.note,
      validated.data.autoComplete
    );

    return NextResponse.json({
      success: true,
      data: result.goal,
      completed: result.completed,
    });
  } catch (error) {
    console.error('Error updating goal progress:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}