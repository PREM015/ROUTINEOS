import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const scoringService = new ScoringService();

const calculateScoreSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isMinimumDay: z.boolean().optional(),
  minimumDayTemplateId: z.string().optional(),
  isRestDay: z.boolean().optional(),
});

/**
 * POST /api/score
 * Calculate or recalculate daily score
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = calculateScoreSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await scoringService.calculateDailyScore(
      userIdFromSession(session),
      validated.data.date,
      {
        isMinimumDay: validated.data.isMinimumDay,
        minimumDayTemplateId: validated.data.minimumDayTemplateId,
        isRestDay: validated.data.isRestDay,
      }
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error calculating score:', error);
    return NextResponse.json(
      { error: 'Failed to calculate score' },
      { status: 500 }
    );
  }
}
