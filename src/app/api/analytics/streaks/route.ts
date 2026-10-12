import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { userService } from '@/server/services/user.service';
import { getTodayString, shiftCalendarDay } from '@/lib/dates';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const streakRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/analytics/streaks
 * Streak analytics with timeline and milestones over a date range
 * (defaults to the last 90 days). Delegates to AnalyticsService.
 *
 * The default range is anchored to the user's `today` in their timezone, like
 * every other analytics entry point. It previously defaulted `to` to the UTC
 * date, so the calendar's timeline and completed-day counts were windowed on
 * UTC days and could be off by one for any non-UTC user.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userIdFromSession(session);
    const { searchParams } = new URL(request.url);
    const timezone = await userService.getTimezone(userId);
    const today = getTodayString(timezone);
    const range = {
      from: searchParams.get('from') ?? shiftCalendarDay(today, -90),
      to: searchParams.get('to') ?? today,
    };

    const validated = streakRangeSchema.safeParse(range);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid range', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const analytics = await analyticsService.getStreaks(
      userId,
      validated.data.from,
      validated.data.to
    );

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching streak analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streak analytics' },
      { status: 500 }
    );
  }
}
