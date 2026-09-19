import { auth } from '@/lib/auth';
import { getHabitAnalytics } from '@/server/analytics/habits';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const habitId = searchParams.get('habitId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!habitId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'habitId, startDate, and endDate required' },
        { status: 400 }
      );
    }

    const analytics = await getHabitAnalytics(
      session.user.id,
      habitId,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching habit analytics:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}