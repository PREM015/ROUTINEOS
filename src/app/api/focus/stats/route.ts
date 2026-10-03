import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusStatsQuerySchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { previousCalendarDay } from '@/lib/dates';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/focus/stats?from&to — per-day focus statistics in the user's own zone.
 *
 * Every figure comes from `lib/focus/metrics.ts`, the shared glossary. That is the
 * point of the endpoint existing: the audit found **four** definitions of "focus
 * minutes" that could legitimately disagree about the same day, and this is the
 * one place a focus number is computed.
 *
 * Defaults to the last seven days, because that is what the streak and the bar
 * chart need, and a caller asking for "today" can say so.
 *
 * The `from`/`to` bounds are resolved through `dayBoundsInTimezone` rather than
 * `new Date('YYYY-MM-DD')`, which is UTC midnight — the exact bug class
 * `lib/dates.ts` documents at length, and the reason a Tokyo user's evening
 * sessions used to land on the previous day.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = focusStatsQuerySchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = await focusService.getStats(
      userIdFromSession(session),
      parsed.data.from ?? undefined,
      parsed.data.to ?? undefined
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error computing focus stats:', error);
    return NextResponse.json({ error: 'Failed to compute focus stats' }, { status: 500 });
  }
}

/**
 * Default range: the last seven days, ending today.
 *
 * Seven rather than thirty because the chart is seven bars and the streak is a
 * consecutive-day count — a wider window would ship more rows for figures nobody
 * looks at. Exported so the service applies the same default the route documents,
 * instead of the two drifting apart.
 */
export function defaultStatsRange(today: string): { from: string; to: string } {
  // Six steps back is seven days inclusive of today.
  let cursor = today;
  for (let i = 0; i < 6; i += 1) cursor = previousCalendarDay(cursor);
  return { from: cursor, to: today };
}
