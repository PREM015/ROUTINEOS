import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/journal/[id]/revisions
 * List version history (revisions) of a journal entry owned by the user,
 * newest first.
 *
 * Bounded to the most recent slice: history is unbounded in the schema, and an
 * entry edited hundreds of times should not return hundreds of full copies of
 * its content to open a dialog.
 */
export async function GET(
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

    const revisions = await journalService.listRevisions(userIdFromSession(session), parsedParams.data.id);

    return NextResponse.json({ success: true, data: revisions });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }

    console.error('Error fetching journal revisions:', error);
    return NextResponse.json({ error: 'Failed to fetch journal revisions' }, { status: 500 });
  }
}
