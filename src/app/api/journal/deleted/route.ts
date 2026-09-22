import { auth } from '@/lib/auth';
import { listDeletedJournalEntries } from '@/lib/journal/crud';
import { deletedJournalQuerySchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/deleted
 * List soft-deleted journal entries (the trash), newest deletion first.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const validated = deletedJournalQuerySchema.safeParse({
      limit: limitParam ? Number(limitParam) : 20,
      offset: offsetParam ? Number(offsetParam) : 0,
    });
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: validated.error.flatten(),
        },
        { status: 400 }
      );
    }

    const entries = await listDeletedJournalEntries(
      session.user.id,
      validated.data
    );

    return NextResponse.json({
      success: true,
      data: entries,
      meta: {
        total: entries.length,
        limit: validated.data.limit ?? 20,
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
