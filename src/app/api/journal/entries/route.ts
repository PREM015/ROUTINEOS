import { auth } from '@/lib/auth';
import { listJournalEntries } from '@/lib/journal/crud';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/entries
 * List journal entries for a date range with tag/stat summaries
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('from') ?? searchParams.get('startDate');
    const endDate = searchParams.get('to') ?? searchParams.get('endDate');
    const tagId = searchParams.get('tagId');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !datePattern.test(startDate)) {
      return NextResponse.json(
        { error: 'Invalid from/startDate parameter' },
        { status: 400 }
      );
    }
    if (endDate && !datePattern.test(endDate)) {
      return NextResponse.json(
        { error: 'Invalid to/endDate parameter' },
        { status: 400 }
      );
    }

    const limit = limitParam ? Number(limitParam) : 50;
    const offset = offsetParam ? Number(offsetParam) : 0;
    if (Number.isNaN(limit) || Number.isNaN(offset) || limit < 1 || limit > 100 || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const entries = await listJournalEntries(session.user.id, {
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      tagId: tagId ?? undefined,
      limit,
      offset,
    });

    // Aggregate summary stats from the returned window
    const taggedCount = entries.reduce((count, entry) => count + (entry.tags?.length ?? 0), 0);
    const moodValues = entries
      .map(entry => entry.mood)
      .filter((mood): mood is number => mood !== null && mood !== undefined);
    const energyValues = entries
      .map(entry => entry.energy)
      .filter((energy): energy is number => energy !== null && energy !== undefined);
    const average = (values: number[]) =>
      values.length > 0 ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;

    const tags = new Map<string, { id: string; name: string; color: string | null; count: number }>();
    for (const entry of entries) {
      for (const relation of entry.tags ?? []) {
        const existing = tags.get(relation.tag.id);
        if (existing) {
          existing.count += 1;
        } else {
          tags.set(relation.tag.id, {
            id: relation.tag.id,
            name: relation.tag.name,
            color: relation.tag.color,
            count: 1,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: entries,
      meta: {
        total: entries.length,
        limit,
        offset,
        summary: {
          daysJournaled: entries.length,
          totalTags: taggedCount,
          averageMood: average(moodValues),
          averageEnergy: average(energyValues),
          tags: [...tags.values()].sort((a, b) => b.count - a.count),
        },
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