import { NextRequest, NextResponse } from 'next/server';
import { sleepSessionService } from '@/server/services/sleep-session.service';

/**
 * GET /api/cron/sleep-notifications
 * External-scheduler cron (call every ~5 minutes via an external service).
 * Creates today's sleep prompts for users whose bedtime has passed and
 * auto-starts sleep for prompts whose auto-start timeout has elapsed.
 * Guarded by CRON_SECRET.
 *
 * NOTE: this replaces the removed Vercel 5-minute cron entry; on Vercel Hobby the
 * ~2-daily cron budget cannot hit a 5-minute cadence, so the deployment must
 * point an external scheduler at this endpoint.
 */

export async function GET(request: NextRequest) {
  const requestAuth = request.headers.get('authorization');
  if (requestAuth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await sleepSessionService.processSleepNotifications();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('sleep-notifications cron failed', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed' },
      { status: 500 }
    );
  }
}