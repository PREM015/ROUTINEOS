import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NextResponse } from 'next/server';

/**
 * GET /api/focus/active
 * Fetch the current active/paused focus session for today, or null
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await focusService.getActiveSession(session.user.id);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching active focus session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active focus session' },
      { status: 500 }
    );
  }
}
