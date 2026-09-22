import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextResponse } from 'next/server';

/**
 * GET /api/sleep/session – resolve the user's current sleep state (active
 * session, pending prompt with auto-start countdown, today's log). Also
 * lazily creates today's prompt when bedtime has passed.
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await sleepSessionService.resolveSleepState(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching sleep session status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep session status' },
      { status: 500 }
    );
  }
}