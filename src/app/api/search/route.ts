import { auth } from '@/lib/auth';
import { SearchService } from '@/server/services/search.service';
import { globalSearchSchema } from '@/schemas/search.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/search
 * Global search across habits, goals, projects, tasks, and journal entries
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

    const validated = globalSearchSchema.safeParse({
      query: searchParams.get('q') ?? '',
      type: searchParams.get('type') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: limitParam ? Number(limitParam) : 5,
      offset: offsetParam ? Number(offsetParam) : 0,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const searchService = new SearchService();
    const results = await searchService.globalSearch(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Error performing search:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}