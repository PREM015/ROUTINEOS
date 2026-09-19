import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getJournalEntry, setJournalTags } from '@/lib/journal/crud';
import { NextRequest, NextResponse } from 'next/server';

const setTagsSchema = z.object({
  tagIds: z.array(z.string().min(1, 'Tag id is required')).max(50, 'Too many tags'),
});

/**
 * GET /api/journal/[id]/tags
 * Fetch the tags attached to a journal entry
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await getJournalEntry(session.user.id, params.id);
    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const tags = (entry.tags ?? []).map(relation => relation.tag);

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    console.error('Error fetching journal entry tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entry tags' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/journal/[id]/tags
 * Replace the full tag set on a journal entry
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = setTagsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await getJournalEntry(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const count = await setJournalTags(session.user.id, params.id, validated.data.tagIds);
    const updated = await getJournalEntry(session.user.id, params.id);
    const tags = (updated?.tags ?? []).map(relation => relation.tag);

    return NextResponse.json({
      success: true,
      data: tags,
      meta: { attached: count },
    });
  } catch (error) {
    console.error('Error updating journal entry tags:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update journal entry tags' },
      { status: 500 }
    );
  }
}