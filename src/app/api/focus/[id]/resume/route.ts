import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/focus/[id]/resume
 *
 * The pause span is added to `pausedTotalSeconds` here rather than being derived
 * from `startedAt` on read, because a session paused three times has no way to
 * express "how long was it paused" in a single timestamp pair. Getting this wrong
 * is not cosmetic: paused time billed as focus time inflates every total in the
 * product, so the arithmetic has to happen exactly once, on the transition.
 *
 * Idempotent — resuming a running session returns it unchanged.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const resumed = await focusService.resumeSession(session.user.id, id);
    return NextResponse.json({ success: true, data: resumed });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error resuming focus session:', error);
    return NextResponse.json({ error: 'Failed to resume focus session' }, { status: 500 });
  }
}
