import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { NotFoundError } from '@/lib/errors/app-error';

/**
 * DELETE /api/workouts/exercises/[id]
 *
 * Removes the exercise and its sets. Training **sessions** survive, because a
 * session is the historical record and deleting a lookup row must not delete a
 * training history.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    try {
      await new CareerService().deleteExercise(auth.auth.userId, id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}