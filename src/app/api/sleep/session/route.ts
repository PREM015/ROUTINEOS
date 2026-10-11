import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const data = await sleepSessionService.resolveSleepState(userIdFromSession(session));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
