import { auth } from '@/lib/auth';
import { restoreJournalRevision } from '@/lib/journal/crud';
import { journalRevisionIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/journal/[id]/revisions/[revisionId]/restore
 * Restore a revision's title/content onto its entry. The pre-restore content
 * is snapshotted into a new revision first, so history is never lost.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const rawParams = await params;
    const parsedParams = journalRevisionIdSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }
    const { id, revisionId } = parsedParams.data;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await restoreJournalRevision(
      session.user.id,
      id,
      revisionId
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error restoring journal revision:', error);

    if (error instanceof Error) {
      if (
        error.message === 'Journal entry not found' ||
        error.message === 'Journal revision not found'
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to restore journal revision' },
      { status: 500 }
    );
  }
}
