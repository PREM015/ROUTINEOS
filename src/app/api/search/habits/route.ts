import { auth } from '@/lib/auth';
import { SearchService } from '@/server/services/search.service';
import { globalSearchSchema } from '@/schemas/search.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/search/habits
 * Search the user's habits by name or description
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
    const habits = await searchService.searchHabits(
      session.user.id,
      validated.data.query,
      validated.data.limit ?? 20,
      validated.data.offset ?? 0
    );

    return NextResponse.json({
      success: true,
      data: habits,
      meta: {
        total: habits.length,
        limit: validated.data.limit ?? 20,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error searching habits:', error);
    return NextResponse.json(
      { error: 'Failed to search habits' },
      { status: 500 }
    );
  }
}