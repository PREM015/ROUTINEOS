import { auth } from '@/lib/auth';
import {
  getJournalEntryIncludingDeleted,
  permanentlyDeleteJournalEntry,
} from '@/lib/journal/crud';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DELETE /api/journal/[id]/permanent
 * Permanently delete a journal entry (including its revisions).
 * This cannot be undone. Ownership is verified before deletion.
 */
export async function DELETE(
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

    const existing = await getJournalEntryIncludingDeleted(
      session.user.id,
      id
    );
    if (!existing) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    await permanentlyDeleteJournalEntry(session.user.id, id);

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error permanently deleting journal entry:', error);

    if (error instanceof Error) {
      if (error.message === 'Journal entry not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to permanently delete journal entry' },
      { status: 500 }
    );
  }
}
