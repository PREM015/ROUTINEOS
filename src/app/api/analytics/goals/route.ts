import { auth } from '@/lib/auth';
import { getAllGoalsAnalytics } from '@/server/analytics/goals';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const goalsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function addDaysIso(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/goals
 * Goal analytics over an optional date range (defaults to the last 30 days).
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
      from: searchParams.get('from') ?? addDaysIso(today, -30),
      to: searchParams.get('to') ?? today.toISOString().slice(0, 10),
    };

    const validated = goalsQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const analytics = await getAllGoalsAnalytics(
      session.user.id,
      validated.data.from as string,
      validated.data.to as string
    );

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching goal analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal analytics' },
      { status: 500 }
    );
  }
}