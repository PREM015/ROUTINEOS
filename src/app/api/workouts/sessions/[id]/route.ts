import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { NotFoundError } from '@/lib/errors/app-error';

/**
 * GET    /api/workouts/sessions/[id] — one session.
 * PATCH  /api/workouts/sessions/[id] — edit notes, name, rest-day flag.
 * DELETE /api/workouts/sessions/[id] — remove the session.
 *
 * All three go through `requireSession` and then the service's ownership check.
 * A session belonging to somebody else is a 404 with the same body as a session
 * that does not exist, so a caller cannot use this endpoint to discover which
 * ids are real.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const session = await new CareerService().getSession(auth.auth.userId, id);

    if (!session) {
      return NextResponse.json({ error: 'Workout session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();

    // Only the descriptive fields are editable. The date and the sets are the
    // historical record of what happened; letting a PATCH rewrite them would
    // make the log unfalsifiable.
    const updated = await new CareerService().updateSession(
      auth.auth.userId,
      id,
      {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.durationMinutes !== undefined && {
          durationMinutes: body.durationMinutes,
        }),
        ...(body.isRestDay !== undefined && { isRestDay: body.isRestDay }),
      }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    try {
      await new CareerService().deleteSession(auth.auth.userId, id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: 'Workout session not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}