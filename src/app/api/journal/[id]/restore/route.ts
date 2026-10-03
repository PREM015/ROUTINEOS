import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/journal/[id]/restore
 * Restore a soft-deleted journal entry owned by the user.
 *
 * Restoring an entry whose date has since been written again fails on
 * `@@unique([userId, date])`, which is a conflict worth reporting rather than a
 * server error — the user needs to move or delete one of the two entries.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedParams = journalEntryIdSchema.safeParse({ id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid entry id', details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await journalService.restore(session.user.id, parsedParams.data.id);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }

    console.error('Error restoring journal entry:', error);
    return NextResponse.json({ error: 'Failed to restore journal entry' }, { status: 500 });
  }
}
