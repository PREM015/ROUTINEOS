import { auth } from '@/lib/auth';
import { restoreJournalEntry } from '@/lib/journal/crud';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/journal/[id]/restore
 * Restore a soft-deleted journal entry owned by the user.
 */
export async function POST(
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

    const entry = await restoreJournalEntry(session.user.id, id);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error restoring journal entry:', error);

    if (error instanceof Error) {
      if (error.message === 'Journal entry not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to restore journal entry' },
      { status: 500 }
    );
  }
}
