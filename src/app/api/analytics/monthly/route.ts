import { auth } from '@/lib/auth';
import { monthlySummary } from '@/server/analytics/monthly';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

function currentMonth(): string {
  return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
}

/**
 * GET /api/analytics/monthly
 * Real month-level aggregates (scores, habits, focus, journal, goals, sleep)
 * for a specific `YYYY-MM` month. Defaults to the current calendar month.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? currentMonth();

    const validated = monthQuerySchema.safeParse({ month });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await monthlySummary(session.user.id, validated.data.month);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly analytics' },
      { status: 500 }
    );
  }
}