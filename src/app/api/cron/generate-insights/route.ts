import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import { generateInsights } from '../../../../../scripts/generate-insights';

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await generateInsights();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('generate insights cron failed', error);
    return NextResponse.json({ success: false, error: 'Cron job failed' }, { status: 500 });
  }
}
