import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/sleep/session/start – start a sleep session (idempotent).
 */

export async function POST(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await sleepSessionService.startSleep(session.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error starting sleep session:', error);
    return NextResponse.json(
      { error: 'Failed to start sleep session' },
      { status: 500 }
    );
  }
}