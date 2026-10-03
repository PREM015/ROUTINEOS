import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { UserService } from '@/server/services/user.service';
import { userIdFromSession } from '@/types/ids';

const monthQuerySchema = z.object({
  // A plain /^\d{4}-\d{2}$/ also accepts 2026-99, which would reach the service
  // and surface as a 500. Refine so an out-of-range month is a 400 here.
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((value) => {
      const monthNumber = Number(value.slice(5, 7));
      return monthNumber >= 1 && monthNumber <= 12;
    }, { message: 'month must be 01-12' }),
});

/**
 * GET /api/analytics/monthly
 * Real month-level aggregates (scores, habits, focus, journal, goals, sleep)
 * for a specific `YYYY-MM` month. Defaults to the current calendar month in the
 * user's timezone. Delegates to AnalyticsService.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // The user's timezone, as the docstring promises. It hard-coded
    // `DEFAULT_TZ` instead, so a `America/Los_Angeles` user at 20:00 local on
    // the 1st was served September data — the month boundary was off by hours.
    const timezone = await new UserService()
      .getTimezone(userIdFromSession(session))
      .catch(() => DEFAULT_TZ);
    const month = searchParams.get('month') ?? getTodayString(timezone).slice(0, 7);

    const validated = monthQuerySchema.safeParse({ month });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await analyticsService.getMonthly(userIdFromSession(session), validated.data.month);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly analytics' },
      { status: 500 }
    );
  }
}
