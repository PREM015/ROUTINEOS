import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sleep/session/stop – stop the active sleep session and persist
 *                                a SleepLog for the wake date.
 *
 * Stopping when nothing is running is a state conflict, not a missing
 * resource: the endpoint exists and answered correctly. 409 keeps it out of
 * the "endpoint not found" bucket in request logs and monitoring.
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
    if (error instanceof Error && error.message === 'No active sleep session') {
      return NextResponse.json(
        { error: error.message, details: { reason: 'no_active_session' } },
        { status: 409 }
      );
    }
    console.error('Error stopping sleep session:', error);
    return NextResponse.json(
      { error: 'Failed to stop sleep session' },
      { status: 500 }
    );
  }
}