import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sleep/session/stop – stop the active sleep session and persist
 *                                a SleepLog for the wake date.
 */

export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await sleepSessionService.stopSleep(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error stopping sleep session:', error);
    if (error instanceof Error && error.message === 'No active sleep session') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to stop sleep session' },
      { status: 500 }
    );
  }
}