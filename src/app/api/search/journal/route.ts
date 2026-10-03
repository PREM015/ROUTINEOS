import { auth } from '@/lib/auth';
import { AppError } from '@/lib/errors/app-error';
import { journalService } from '@/server/services/journal.service';
import { journalEntryQuerySchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/search/journal
 * Ranked search over the user's own journal entries.
 *
 * Distinct from `?search=` on `GET /api/journal`, which is a database filter
 * (case-insensitive contains, ordered by date) and shares the list's paging.
 * This endpoint ranks by match count with a title match weighted double, so it
 * answers "which entry is about this" rather than "show me every entry
 * mentioning this".
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = journalEntryQuerySchema
      .pick({ search: true, limit: true })
      .safeParse({
        search: searchParams.get('q') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
      });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const term = validated.data.search ?? '';
    if (term.trim().length === 0) {
      return NextResponse.json({ error: 'A search term is required' }, { status: 400 });
    }

    const results = await journalService.search(
      session.user.id,
      term,
      validated.data.limit ?? 20
    );

    return NextResponse.json({
      success: true,
      data: results,
      meta: { total: results.length, limit: validated.data.limit ?? 20 },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, details: error.details ?? undefined },
        { status: error.statusCode }
      );
    }
    console.error('Error searching journal entries:', error);
    return NextResponse.json({ error: 'Failed to search journal entries' }, { status: 500 });
  }
}
