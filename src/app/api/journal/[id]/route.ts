import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { ForeignTagError } from '@/lib/journal/policy';
import { journalService } from '@/server/services/journal.service';
import {
  journalEntryIdSchema,
  updateJournalEntrySchema,
} from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/journal/[id]
 * Fetch a single journal entry owned by the user.
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

    const entry = await journalService.get(userIdFromSession(session), parsedParams.data.id);
    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entry' }, { status: 500 });
  }
}

/**
 * PATCH /api/journal/[id]
 * Update mood/energy/title/content/favorite/archive/tags.
 *
 * `null` clears a field and an absent key leaves it alone; the previous version
 * could express neither, so clearing a rating silently kept the old value.
 * When the title or content changes, the previous version is snapshotted into a
 * revision BEFORE overwriting so history is never lost.
 */
export async function PATCH(
  request: NextRequest,
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

    const body = await request.json();
    const validated = updateJournalEntrySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const entry = await journalService.update(
      userIdFromSession(session),
      parsedParams.data.id,
      validated.data
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }
    if (error instanceof ForeignTagError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error('Error updating journal entry:', error);
    return NextResponse.json({ error: 'Failed to update journal entry' }, { status: 500 });
  }
}

/**
 * DELETE /api/journal/[id]
 * Soft delete a journal entry. The entry moves to the trash and can be restored;
 * its revision history is kept. Permanent deletion is a separate, trash-only
 * endpoint so the two are never one mis-click apart.
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

    const entry = await journalService.softDelete(userIdFromSession(session), parsedParams.data.id);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }

    console.error('Error deleting journal entry:', error);
    return NextResponse.json({ error: 'Failed to delete journal entry' }, { status: 500 });
  }
}
