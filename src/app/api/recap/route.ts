import { auth } from '@/lib/auth';
import { recapService } from '@/server/services/recap.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/recap?period=day|week|month|year&date=YYYY-MM-DD
 * Real-data recap for the authenticated user. `date` anchors the period and
 * defaults to today (in the user's timezone).
 */

const recapQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = recapQuerySchema.safeParse({
      period: searchParams.get('period') ?? 'week',
      date: searchParams.get('date') ?? undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await recapService.getReport(
      session.user.id,
      validated.data.period,
      validated.data.date
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error generating recap:', error);
    return NextResponse.json({ error: 'Failed to generate recap' }, { status: 500 });
  }
}