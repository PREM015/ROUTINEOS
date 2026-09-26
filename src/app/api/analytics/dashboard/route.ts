import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const dashboardQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/analytics/dashboard
 * Period-scoped rollup (day / week / month / year) in the user's timezone,
 * plus every bento widget dataset. All analytics logic lives in
 * AnalyticsService so this handler stays thin.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = dashboardQuerySchema.safeParse({
      period: searchParams.get('period') ?? undefined,
      date: searchParams.get('date') ?? undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await analyticsService.getDashboard(session.user.id, {
      period: validated.data.period,
      date: validated.data.date,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard analytics' },
      { status: 500 }
    );
  }
}