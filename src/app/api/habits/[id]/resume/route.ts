import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/habits/[id]/resume
 * Resume paused habit
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

    const habitService = new HabitService();
    await habitService.resumeHabit(session.user.id, params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resuming habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to resume habit' },
      { status: 500 }
    );
  }
}