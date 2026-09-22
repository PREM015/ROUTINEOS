import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { logHabitSchema } from '@/schemas/habit.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/habits/[id]/log
 * Log habit completion
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validated = logHabitSchema.safeParse({
      habitId: id,
      ...body,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const result = await habitService.logHabit(session.user.id, validated.data);

    return NextResponse.json({
      success: true,
      data: {
        log: result.log,
        streakUpdated: result.streakUpdated,
        newStreak: result.newStreak,
      },
    });
  } catch (error) {
    console.error('Error logging habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to log habit' },
      { status: 500 }
    );
  }
}