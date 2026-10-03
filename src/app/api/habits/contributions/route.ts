import { auth } from '@/lib/auth';
import { habitContributionService } from '@/server/services/habit-contribution.service';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const querySchema = z.object({
  year: z.coerce.number().int().min(1970).max(9999),
});

/**
 * GET /api/habits/contributions?year=2026
 *
 * One year of habit contribution data: a dense cell per day, monthly buckets,
 * weekday patterns, a per-habit breakdown, streaks, and the previous year's rate
 * for comparison when there is history for it.
 *
 * Thin handler per FILE.MD - authenticate, validate, delegate. The rule that
 * decides which habits were *due* on which day lives in
 * `lib/habits/contribution-eligibility`; the aggregation is in
 * `lib/habits/contributions`; this class only loads.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ year: searchParams.get('year') });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid year', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = await habitContributionService.getYear(userIdFromSession(session), parsed.data.year);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching habit contributions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habit contributions' },
      { status: 500 }
    );
  }
}
