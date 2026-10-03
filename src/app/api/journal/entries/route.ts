import { auth } from '@/lib/auth';
import { journalService } from '@/server/services/journal.service';
import { journalEntryQuerySchema } from '@/schemas/journal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/journal/entries
 * List entries for a date range with a tag/stat summary.
 *
 * A second listing endpoint alongside `GET /api/journal`. It is kept because it
 * returns a `summary` block the plain list does not, but the validation now
 * comes from `journalEntryQuerySchema` instead of a hand-rolled regex and three
 * `Number.isNaN` checks, which is what let `?limit=abc` through to the
 * repository.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = journalEntryQuerySchema.safeParse({
      startDate: searchParams.get('from') ?? searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('to') ?? searchParams.get('endDate') ?? undefined,
      tagId: searchParams.get('tagId') ?? undefined,
      limit: searchParams.get('limit') ?? 50,
      offset: searchParams.get('offset') ?? 0,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await journalService.list(session.user.id, validated.data);
    const entries = result.entries;

    const average = (values: number[]): number | null =>
      values.length > 0
        ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
        : null;

    const moods = entries
      .map((entry) => entry.mood)
      .filter((mood): mood is number => mood !== null && mood !== undefined);
    const energies = entries
      .map((entry) => entry.energy)
      .filter((energy): energy is number => energy !== null && energy !== undefined);

    const tags = new Map<
      string,
      { id: string; name: string; color: string | null; count: number }
    >();
    let totalTags = 0;
    for (const entry of entries) {
      for (const relation of entry.tags ?? []) {
        totalTags += 1;
        const existing = tags.get(relation.tag.id);
        if (existing) existing.count += 1;
        else {
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
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        summary: {
          daysJournaled: entries.length,
          totalTags,
          averageMood: average(moods),
          averageEnergy: average(energies),
          tags: [...tags.values()].sort((a, b) => b.count - a.count),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}
