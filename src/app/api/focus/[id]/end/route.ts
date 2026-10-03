import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusReflectionSchema } from '@/schemas/focus.schema';
import { focusSessionEndReasonSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = focusReflectionSchema.extend({
  /**
   * Why it ended.
   *
   * Required, and the reason is the completion *rate*. A schema where `endReason`
   * was optional would make "completed" indistinguishable from "stopped" for any
   * caller that forgot it, and the rate would silently drift toward 100% — the
   * same failure mode as the break contamination, one level up.
   */
  endReason: focusSessionEndReasonSchema,
  /**
   * The client's own claim of elapsed time.
   *
   * Recorded for auditing and deliberately **not** trusted: the service computes
   * the figure from server-side timestamps. See `FocusService.endSession`.
   */
  claimedActualSeconds: z.number().int().min(0).max(24 * 3600).optional(),
});

/**
 * POST /api/focus/[id]/end
 *
 * Supersedes `/api/focus/[id]/complete`, which had a fatal flaw: it *reconstructed*
 * a timer snapshot treating the planned timebox as fully run, so "complete" always
 * recorded the planned duration. Stopping a session at four minutes was
 * impossible to express — the old endpoint would have credited 25.
 *
 * This one derives the real figure from `startedAt`, the terminal timestamp and
 * `pausedTotalSeconds`, so partial work is recorded as partial work.
 *
 * Idempotent: re-ending an ended session returns it unchanged rather than
 * throwing, because the retry queue cannot distinguish "already done" from "just
 * done" after a lost response.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // No body is valid: the reason defaults to STOPPED below.
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { endReason, claimedActualSeconds, ...reflection } = parsed.data;
    const ended = await focusService.endSession(userIdFromSession(session), id, {
      // A body-less request means "I stopped", which is the safe default: it
      // records a partial session rather than claiming finished work.
      endReason: endReason ?? 'STOPPED',
      ...reflection,
      claimedActualMs:
        claimedActualSeconds === undefined ? undefined : claimedActualSeconds * 1000,
    });

    return NextResponse.json({ success: true, data: ended });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error ending focus session:', error);
    return NextResponse.json({ error: 'Failed to end focus session' }, { status: 500 });
  }
}
