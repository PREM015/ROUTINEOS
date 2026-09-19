import { auth } from '@/lib/auth';
import { SleepRepository } from '@/server/repositories/sleep.repository';
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

    const sleepRepository = new SleepRepository();
    const logs = await sleepRepository.findByRange(
      session.user.id,
      startDate,
      endDate
    );

    // Calculate summary statistics
    const validLogs = logs.filter(l => l.actualDurationMinutes !== null);

    const summary = {
      totalDays: logs.length,
      averageDuration:
        validLogs.length > 0
          ? Math.round(
              validLogs.reduce((sum, l) => sum + (l.actualDurationMinutes || 0), 0) /
                validLogs.length
            )
          : 0,
      averageQuality:
        logs.filter(l => l.quality).length > 0
          ? logs.reduce((sum, l) => sum + (l.quality || 0), 0) /
            logs.filter(l => l.quality).length
          : null,
      totalDeficit: validLogs.reduce((sum, l) => sum + (l.deficitMinutes || 0), 0),
      daysRested: logs.filter(l => l.feltRested).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        logs,
        summary,
      },
    });
  } catch (error) {
    console.error('Error fetching sleep history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep history' },
      { status: 500 }
    );
  }
}