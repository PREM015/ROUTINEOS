import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

const scoringService = new ScoringService();

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/scores/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Get daily scores for a date range (ascending by date).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const validated = dateRangeSchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid date range', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const scores = await scoringService.getDailyScoreRange(
      session.user.id,
      validated.data.startDate,
      validated.data.endDate
    );

    return NextResponse.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    console.error('Error fetching daily scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily scores' },
      { status: 500 }
    );
  }
}
