import { NextRequest, NextResponse } from 'next/server';
import { computeDailyScores } from '../../../../../scripts/compute-daily-scores';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await computeDailyScores();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('compute daily scores cron failed', error);
    return NextResponse.json({ success: false, error: 'Cron job failed' }, { status: 500 });
  }
}
