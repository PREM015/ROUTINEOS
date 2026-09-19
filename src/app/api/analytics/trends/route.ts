import { auth } from '@/lib/auth';
import { trendAnalysis } from '@/server/analytics/trends';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const trendQuerySchema = z.object({
  metric: z.enum(['score', 'sleep']).default('score'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function addDaysIso(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/trends
 * Trend analysis for daily score or sleep duration over a date range
 * (defaults to the last 30 days).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const today = new Date();
    const queryData = {
      metric: (searchParams.get('metric') as 'score' | 'sleep') ?? 'score',
      from: searchParams.get('from') ?? addDaysIso(today, -30),
      to: searchParams.get('to') ?? today.toISOString().slice(0, 10),
    };

    const validated = trendQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const analytics = await trendAnalysis(session.user.id, validated.data.metric, {
      startDate: validated.data.from,
      endDate: validated.data.to,
    });

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching trend analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trend analytics' },
      { status: 500 }
    );
  }
}