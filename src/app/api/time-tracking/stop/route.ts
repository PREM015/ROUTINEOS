import { auth } from '@/lib/auth';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { NextResponse } from 'next/server';

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

    const repository = new TimeEntryRepository();
    const entry = await repository.stopRunning(session.user.id);

    if (!entry) {
      return NextResponse.json({ error: 'No running time entry' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error stopping time entry:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to stop time entry' }, { status: 500 });
  }
}