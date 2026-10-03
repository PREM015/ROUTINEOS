import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import { journalRevisionIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/journal/[id]/revisions/[revisionId]/restore
 * Restore a revision's title/content onto its entry. The pre-restore content
 * is snapshotted into a new revision first, so history is never lost.
 *
 * Only title and content are restored, because `JournalRevision` only stores
 * those two fields. Mood and tags are left as they are, which is the honest
 * behaviour: there is no stored version of them to restore from.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const { id, revisionId } = await params;
    const parsedParams = journalRevisionIdSchema.safeParse({ id, revisionId });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await journalService.restoreRevision(
      session.user.id,
      parsedParams.data.id,
      parsedParams.data.revisionId
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }

    console.error('Error restoring journal revision:', error);
    return NextResponse.json({ error: 'Failed to restore journal revision' }, { status: 500 });
  }
}
