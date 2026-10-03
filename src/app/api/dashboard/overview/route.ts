import { auth } from '@/lib/auth';
import { DEFAULT_WINDOW_DAYS } from '@/constants/dashboard';
import { dashboardOverviewService } from '@/server/services/dashboard-overview.service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).catch(DEFAULT_WINDOW_DAYS),
});

/**
 * GET /api/dashboard/overview?days=30
 *
 * One read for every trend-shaped widget on `/dashboard`.
 *
 * The page used to make nine independent client fetches for data that is all
 * functions of the same trailing window, which is how the same page came to show
 * two different "habits due today" counts (audit F15, 17.3). All the arithmetic
 * now lives in `DashboardOverviewService`; this handler only validates and
 * delegates, per FILE.MD.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ days: searchParams.get('days') });

    const data = await dashboardOverviewService.getOverview(
      session.user.id,
      parsed.success ? parsed.data.days : DEFAULT_WINDOW_DAYS
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard overview' }, { status: 500 });
  }
}
