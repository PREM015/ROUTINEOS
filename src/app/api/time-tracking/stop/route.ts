import { auth } from '@/lib/auth';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { handleError } from '@/lib/errors/error-handler';
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
    return handleError(error);
  }
}
