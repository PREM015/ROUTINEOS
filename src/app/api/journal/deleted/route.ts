import { auth } from '@/lib/auth';
import { journalService } from '@/server/services/journal.service';
import { deletedJournalQuerySchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/deleted
 * List soft-deleted journal entries (the trash), newest deletion first.
 *
 * Only called once the trash panel is opened. It used to be fetched on every
 * load of the journal page, including while the panel was collapsed — a request
 * whose result was never shown.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = deletedJournalQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await journalService.listDeleted(session.user.id, validated.data);

    return NextResponse.json({
      success: true,
      data: result.entries,
      meta: {
        // The full trash size, not the size of this page.
        total: result.total,
        limit: validated.data.limit ?? result.entries.length,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching deleted journal entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deleted journal entries' },
      { status: 500 }
    );
  }
}
