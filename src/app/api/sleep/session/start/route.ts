import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/sleep/session/start – start a sleep session (idempotent).
 */

export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await sleepSessionService.startSleep(userIdFromSession(session));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
