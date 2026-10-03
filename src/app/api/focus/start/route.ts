import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { startFocusSessionSchema } from '@/schemas/focus.schema';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

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

    const started = await focusService.startSession(session.user.id, parsed.data);
    return NextResponse.json({ success: true, data: started }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) {
      // A specific status rather than a generic 400, because the client has a real
      // decision to make here: take over the running session, or end it first.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error starting focus session:', error);
    return NextResponse.json({ error: 'Failed to start focus session' }, { status: 500 });
  }
}
