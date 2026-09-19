import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/routine/today
 * Get today's routine
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const routineService = new RoutineService();
    const routine = await routineService.getRoutineForDate(session.user.id, date);

    return NextResponse.json({
      success: true,
      data: routine,
    });
  } catch (error) {
    console.error('Error fetching today\'s routine:', error);
    return NextResponse.json(
      { error: 'Failed to fetch routine' },
      { status: 500 }
    );
  }
}