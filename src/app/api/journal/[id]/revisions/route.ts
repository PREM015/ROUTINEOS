import { auth } from '@/lib/auth';
import { listJournalRevisions } from '@/lib/journal/crud';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/[id]/revisions
 * List version history (revisions) of a journal entry owned by the user,
 * newest first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawParams = await params;
    const parsedParams = journalEntryIdSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid entry id', details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }
    const { id } = parsedParams.data;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const revisions = await listJournalRevisions(session.user.id, id);

    return NextResponse.json({ success: true, data: revisions });
  } catch (error) {
    console.error('Error fetching journal revisions:', error);

    if (error instanceof Error) {
      if (error.message === 'Journal entry not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch journal revisions' },
      { status: 500 }
    );
  }
}
