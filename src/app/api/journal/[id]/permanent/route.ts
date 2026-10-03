import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import { journalEntryIdSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DELETE /api/journal/[id]/permanent
 * Permanently delete a journal entry (including its revisions).
 *
 * This cannot be undone, and it is reachable only from the trash — soft delete
 * lives on `DELETE /api/journal/[id]` and is what the entry list uses.
 */
export async function DELETE(
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

    await journalService.permanentlyDelete(session.user.id, parsedParams.data.id);

    return NextResponse.json({ success: true, data: { id: parsedParams.data.id } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }

    console.error('Error permanently deleting journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to permanently delete journal entry' },
      { status: 500 }
    );
  }
}
