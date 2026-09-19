import { auth } from '@/lib/auth';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const dayModeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['MINIMUM', 'REST']),
  reason: z.string().optional(),
  templateId: z.string().optional(),
});

/**
 * POST /api/day-mode
 * Activate minimum day or rest day
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = dayModeSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, mode, reason, templateId } = validated.data;

    if (mode === 'MINIMUM') {
      // Activate minimum day
      const breakdown = await calculateDailyScore(session.user.id, date, {
        isMinimumDay: true,
        minimumDayTemplateId: templateId,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode: 'MINIMUM',
          score: breakdown,
        },
      });
    } else {
      // Activate rest day
      const scoreRepository = new ScoreRepository();
      await scoreRepository.upsertScore(session.user.id, date, {
        isRestDay: true,
        restDayReason: reason,
        totalScore: null,
        coreScore: null,
        growthScore: null,
        bonusScore: null,
      });

      return NextResponse.json({
        success: true,
        data: {
          mode: 'REST',
        },
      });
    }
  } catch (error) {
    console.error('Error activating day mode:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to activate day mode' },
      { status: 500 }
    );
  }
}