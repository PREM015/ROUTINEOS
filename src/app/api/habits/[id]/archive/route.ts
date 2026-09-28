import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/habits/[id]/archive
 * Archive habit, or restore it with `?restore=true`.
 *
 * Restore lives here rather than in a separate `restore/` subroute, matching
 * the tasks endpoint. Archiving used to be a one-way door: nothing anywhere in
 * the app could undo it, so a mis-click permanently hid a habit and its whole
 * history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const habitService = new HabitService();

    if (request.nextUrl.searchParams.get('restore') === 'true') {
      const habit = await habitService.restoreHabit(session.user.id, id);
      return NextResponse.json({ success: true, data: habit });
    }

    // A body is optional for archiving, so a malformed/absent one must not be a
    // 500: `request.json()` throws on an empty body.
    const body = await request.json().catch(() => ({}));
    const { reason } = body ?? {};

    await habitService.archiveHabit(session.user.id, id, reason);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to archive habit' },
      { status: 500 }
    );
  }
}