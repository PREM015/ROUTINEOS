import { auth } from '@/lib/auth';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/time-tracking/stop
 * Stop the running timer, setting endTime and computed duration.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await timeTrackingService.stopRunning(userIdFromSession(session));

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error stopping time entry:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'No running time entry' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to stop time entry' }, { status: 500 });
  }
}
