import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { focusService } from '@/server/services/focus.service';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const data = await focusService.getActiveSession(userIdFromSession(session));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
