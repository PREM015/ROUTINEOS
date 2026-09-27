import { auth } from '@/lib/auth';
import { sleepService } from '@/server/services/sleep.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/sleep/history
 * Get sleep history for date range
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate parameters required' },
        { status: 400 }
      );
    }

    const data = await sleepService.getSleepHistory(
      session.user.id,
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching sleep history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep history' },
      { status: 500 }
    );
  }
}
