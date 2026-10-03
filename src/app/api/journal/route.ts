import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import {
  createJournalEntrySchema,
  journalEntryQuerySchema,
  MAX_JOURNAL_PAGE_SIZE,
} from '@/schemas/journal.schema';
import { ForeignTagError } from '@/server/repositories/journal.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal
 * List journal entries, one server-paged slice at a time.
 *
 * Paging happens here rather than in the browser: the page used to fetch
 * `limit=100` and slice those 100 client-side, so a journal with 240 entries
 * could never show the 101st no matter how far the user scrolled.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // A concrete date narrows the range to a single day.
    const date = searchParams.get('date') ?? undefined;
    // A month (YYYY-MM) expands to the whole month; the service owns that
    // expansion so the list, the count and the export narrow identically.
    const month = searchParams.get('month') ?? undefined;

    const validated = journalEntryQuerySchema.safeParse({
      search: searchParams.get('search') ?? undefined,
      mood: searchParams.get('mood') ?? undefined,
      isFavorite: searchParams.get('isFavorite') ?? undefined,
      isArchived: searchParams.get('isArchived') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      date,
      month,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      tagId: searchParams.get('tagId') ?? undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const query = validated.data;
    const limit = query.limit ?? MAX_JOURNAL_PAGE_SIZE;

    const result = await journalService.list(session.user.id, { ...query, limit });

    return NextResponse.json({
      success: true,
      data: result.entries,
      meta: {
        // The size of the whole matching set, which is what a paginator needs.
        // It used to be `entries.length`, i.e. the size of this page.
        total: result.total,
        limit,
        offset: query.offset ?? 0,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

/**
 * POST /api/journal
 * Create a journal entry for a specific date.
 *
 * `JournalEntry` is `@@unique([userId, date])`, so a second entry for a day the
 * user already wrote is a 409 carrying the existing entry — the client opens
 * that entry instead of creating a duplicate.
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

    const entry = await journalService.create(session.user.id, validated.data);
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
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

    console.error('Error creating journal entry:', error);
    return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 });
  }
}
