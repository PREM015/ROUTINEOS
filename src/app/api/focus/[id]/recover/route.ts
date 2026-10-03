import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusRecoveryChoiceSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/focus/[id]/recover — apply the user's decision about an ambiguous
 * session.
 *
 * `GET /api/focus/active` is what raises the question; this is how it is answered.
 * The three options map to the three ways reality can have turned out:
 *
 *   credit-evidence  the user did the work; the timer just lost track of it
 *   credit-full      the session really did run its full timebox
 *   discard          it did not happen, and should not appear in history
 *
 * Every one of them produces a `COMPLETED` session except `discard`, which
 * deletes. That asymmetry is the point: the user's word is what makes work
 * "completed", not the deadline having passed — recovery is the one place where
 * "the timer ran out" is not evidence that "the work happened".
 *
 * `discard` deletes rather than aborting because a session the user rejects
 * outright should not sit in their history as a row they have to keep explaining.
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
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const parsed = focusRecoveryChoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await focusService.recoverSession(
      session.user.id,
      id,
      parsed.data.choice
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error recovering focus session:', error);
    return NextResponse.json({ error: 'Failed to recover focus session' }, { status: 500 });
  }
}
