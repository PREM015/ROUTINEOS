import { auth } from '@/lib/auth';
import {
  createJournalEntry,
  listJournalEntries,
} from '@/lib/journal/crud';
import {
  createJournalEntrySchema,
  journalEntryQuerySchema,
} from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal
 * List journal entries with date/month/pagination/mood filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const month = searchParams.get('month');
    const tagId = searchParams.get('tagId');
    const moodParam = searchParams.get('mood');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const isFavoriteParam = searchParams.get('isFavorite');
    const isArchivedParam = searchParams.get('isArchived');

    let startDate = searchParams.get('startDate') ?? undefined;
    let endDate = searchParams.get('endDate') ?? undefined;

    // A concrete date narrows the range to a single day
    if (date) {
      startDate = date;
      endDate = date;
    }

    // A month (YYYY-MM) expands to the whole month range
    if (month) {
      const [yearStr, monthStr] = month.split('-');
      if (!yearStr || !monthStr) {
        return NextResponse.json(
          { error: 'Invalid month parameter', details: { month } },
          { status: 400 }
        );
      }
      const year = Number(yearStr);
      const monthIndex = Number(monthStr);
      if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 1 || monthIndex > 12) {
        return NextResponse.json(
          { error: 'Invalid month parameter', details: { month } },
          { status: 400 }
        );
      }
      const lastDay = new Date(year, monthIndex, 0).getDate();
      startDate = `${yearStr}-${monthStr}-01`;
      endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    }

    const validated = journalEntryQuerySchema.safeParse({
      search: searchParams.get('search') ?? undefined,
      mood: moodParam ? Number(moodParam) : undefined,
      isFavorite: isFavoriteParam ? isFavoriteParam === 'true' : undefined,
      isArchived: isArchivedParam ? isArchivedParam === 'true' : undefined,
      startDate,
      endDate,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
      limit: limitParam ? Number(limitParam) : 20,
      offset: offsetParam ? Number(offsetParam) : 0,
      tagId: tagId ?? undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const query = validated.data;
    const entries = await listJournalEntries(session.user.id, query);

    return NextResponse.json({
      success: true,
      data: entries,
      meta: {
        total: entries.length,
        limit: query.limit ?? 20,
        offset: query.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entries' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/journal
 * Create a new journal entry
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createJournalEntrySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const entry = await createJournalEntry(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating journal entry:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create journal entry' },
      { status: 500 }
    );
  }
}