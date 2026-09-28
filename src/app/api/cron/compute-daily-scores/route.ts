import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { computeDailyScores } from '../../../../../scripts/compute-daily-scores';

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await computeDailyScores();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('compute daily scores cron failed', error);
    return NextResponse.json({ success: false, error: 'Cron job failed' }, { status: 500 });
  }
}
