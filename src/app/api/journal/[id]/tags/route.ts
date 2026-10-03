import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { ForeignTagError } from '@/server/repositories/journal.repository';
import { journalService } from '@/server/services/journal.service';
import { setJournalTagsSchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/[id]/tags
 * Fetch the tags attached to a journal entry.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await journalService.getOrThrow(session.user.id, id);
    const tags = (entry.tags ?? []).map((relation) => relation.tag);

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }
    console.error('Error fetching journal entry tags:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entry tags' }, { status: 500 });
  }
}

/**
 * PUT /api/journal/[id]/tags
 * Replace the full tag set on a journal entry.
 *
 * The schema moved to `setJournalTagsSchema` and the ids are now `.cuid()`
 * like every other id in this domain — inline route schemas meant the route and
 * the service could disagree about what a valid tag id looks like.
 *
 * A tag id belonging to another user is rejected with 403 before any write.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = setJournalTagsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const count = await journalService.setTags(session.user.id, id, validated.data.tagIds);
    const updated = await journalService.getOrThrow(session.user.id, id);

    return NextResponse.json({
      success: true,
      data: (updated.tags ?? []).map((relation) => relation.tag),
      meta: { attached: count },
    });
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

    console.error('Error updating journal entry tags:', error);
    return NextResponse.json({ error: 'Failed to update journal entry tags' }, { status: 500 });
  }
}
