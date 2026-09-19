import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/habits/[id]/pause
 * Pause habit
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
    const { reason, resumeDate } = body;

    const habitService = new HabitService();
    await habitService.pauseHabit(session.user.id, params.id, reason, resumeDate);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error pausing habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to pause habit' },
      { status: 500 }
    );
  }
}