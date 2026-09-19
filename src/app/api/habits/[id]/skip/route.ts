import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const skipHabitSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
});

/**
 * POST /api/habits/[id]/skip
 * Skip habit for a specific date
 */
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

    // Validate input
    const validated = skipHabitSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    await habitService.skipHabit(
      session.user.id,
      params.id,
      validated.data.date,
      validated.data.reason
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error skipping habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to skip habit' },
      { status: 500 }
    );
  }
}