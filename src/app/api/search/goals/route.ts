import { auth } from '@/lib/auth';
import { SearchService } from '@/server/services/search.service';
import { globalSearchSchema } from '@/schemas/search.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/search/goals
 * Search the user's goals, projects, and tasks by title or description
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
      limit: limitParam ? Number(limitParam) : 20,
      offset: offsetParam ? Number(offsetParam) : 0,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const searchService = new SearchService();
    const results = await searchService.searchGoals(
      session.user.id,
      validated.data.query,
      validated.data.limit ?? 20,
      validated.data.offset ?? 0
    );

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        total: results.length,
        limit: validated.data.limit ?? 20,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error searching goals, projects, and tasks:', error);
    return NextResponse.json(
      { error: 'Failed to search goals, projects, and tasks' },
      { status: 500 }
    );
  }
}