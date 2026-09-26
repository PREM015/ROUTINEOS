import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const reportsQuerySchema = z.object({
  type: z.enum(['weekly', 'monthly']).default('weekly'),
  date: z.string().min(1),
});

/**
 * GET /api/analytics/reports
 * Weekly (Monday, YYYY-MM-DD) or monthly (YYYY-MM) summary report.
 * Delegates to AnalyticsService.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      type: (searchParams.get('type') as 'weekly' | 'monthly' | null) ?? undefined,
      date: searchParams.get('date') ?? undefined,
    };
    if (!searchParams.get('date')) {
      return NextResponse.json(
        { error: 'date parameter is required (weekly: YYYY-MM-DD, monthly: YYYY-MM)' },
        { status: 400 }
      );
    }

    const validated = reportsQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { type, date } = validated.data;
    const periodPattern = type === 'monthly' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (!periodPattern.test(date)) {
      return NextResponse.json(
        { error: `Invalid ${type} date format` },
        { status: 400 }
      );
    }

    const data = await analyticsService.getReport(session.user.id, type, date);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching analytics report:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics report' },
      { status: 500 }
    );
  }
}