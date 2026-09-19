import { auth } from '@/lib/auth';
import { searchJournalEntries } from '@/lib/journal/search';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/search/journal
 * Search the user's journal entries by content and return ranked matches
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? '';
    if (!q.trim()) {
      return NextResponse.json(
        { error: 'Invalid query parameter', details: { q } },
        { status: 400 }
      );
    }

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 20;
    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit parameter' },
        { status: 400 }
      );
    }

    const results = await searchJournalEntries(session.user.id, q.trim(), limit);

    return NextResponse.json({
      success: true,
      data: results,
      meta: { total: results.length, limit },
    });
  } catch (error) {
    console.error('Error searching journal entries:', error);
    return NextResponse.json(
      { error: 'Failed to search journal entries' },
      { status: 500 }
    );
  }
}