import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { focusService } from '@/server/services/focus.service';
import { startFocusSessionSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/focus/start — idempotent start of a **running** session.
 *
 * Separate from `POST /api/focus` rather than folded into it. The legacy route
 * creates a *finished* row from a timer payload and is kept for older clients and
 * offline replay of old queued items; mixing "start a live session" into the same
 * handler is how the create-at-end path ended up being the only path, and the
 * server consequently never knew a session was running.
 *
 * Idempotency is via `clientId`. A double click, a second tab, or an offline
 * replay after reconnect all retry with the same key, and the partial unique
 * index `one_active_session_per_user` plus the service-level check together mean
 * the second attempt cannot create a second live row.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // A body is optional: Start with no arguments is a valid 25-minute focus
      // session using the user's stored settings.
    }

    const parsed = startFocusSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const started = await focusService.startSession(userIdFromSession(session), parsed.data);
    return NextResponse.json({ success: true, data: started }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
