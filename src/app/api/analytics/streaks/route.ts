import { auth } from '@/lib/auth';
import { streakAnalytics } from '@/server/analytics/streaks';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const streakRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function addDaysIso(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/streaks
 * Streak analytics with timeline and milestones over a date range
 * (defaults to the last 90 days).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const today = new Date();
    const range = {
      from: searchParams.get('from') ?? addDaysIso(today, -90),
      to: searchParams.get('to') ?? today.toISOString().slice(0, 10),
    };

    const validated = streakRangeSchema.safeParse(range);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid range', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const analytics = await streakAnalytics(session.user.id, {
      startDate: validated.data.from,
      endDate: validated.data.to,
    });

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching streak analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streak analytics' },
      { status: 500 }
    );
  }
}