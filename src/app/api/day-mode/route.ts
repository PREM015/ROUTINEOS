import { auth } from '@/lib/auth';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';
import { resolveNaturalDayType } from '@/lib/scheduling/resolve-routine';
import prisma from '@/lib/prisma';
import { DEFAULT_TZ } from '@/lib/dates';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DAY_TYPES = ['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'] as const;

const dayModeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['MINIMUM', 'REST', 'DAY_TYPE', 'CLEAR']).optional(),
  dayType: z.enum(DAY_TYPES).optional(),
  reason: z.string().optional(),
  templateId: z.string().optional(),
});

/**
 * GET /api/day-mode?date=YYYY-MM-DD
 * Return the resolved day type for a date: an explicit RoutineException (if one
 * exists) otherwise the natural weekday/weekend type, plus minimum/rest flags.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const [userRepository, scoreRepository] = [new UserRepository(), new ScoreRepository()];
    const settings = await userRepository.getSettings(session.user.id);
    const timezone = settings?.timezone || DEFAULT_TZ;

    const [exception, score] = await Promise.all([
      prisma.routineException.findUnique({
        where: { userId_date: { userId: session.user.id, date } },
      }),
      scoreRepository.findByDate(session.user.id, date),
    ]);

    const naturalDayType = resolveNaturalDayType(date, timezone);
    const dayType = exception?.dayType ?? naturalDayType;
    const templateId = exception?.templateId ?? null;

    return NextResponse.json({
      success: true,
      data: {
        date,
        dayType,
        naturalDayType,
        templateId,
        hasException: Boolean(exception),
        exception: exception
          ? {
              id: exception.id,
              dayType: exception.dayType,
              templateId: exception.templateId,
              reason: exception.reason,
            }
          : null,
        isMinimumDay: score?.isMinimumDay ?? false,
        isRestDay: score?.isRestDay ?? false,
        minimumDayTemplateId: score?.minimumDayTemplateId ?? null,
      },
    });
  } catch (error) {
    console.error('Error fetching day mode:', error);
    return NextResponse.json(
      { error: 'Failed to fetch day mode' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/day-mode
 * Activate minimum day, rest day, set an explicit day type for a date (persists
 * a RoutineException so routine resolution changes), or clear a day-type
 * override back to the natural weekday/weekend schedule.
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

    const { date, mode, dayType, reason, templateId } = validated.data;

    if (mode === 'MINIMUM') {
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
    }

    if (mode === 'REST') {
      const scoreRepository = new ScoreRepository();
      await scoreRepository.upsertScore(session.user.id, date, {
        isRestDay: true,
        restDayReason: reason ?? null,
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

    if (mode === 'CLEAR') {
      await prisma.routineException.deleteMany({
        where: { userId: session.user.id, date },
      });

      return NextResponse.json({
        success: true,
        data: { mode: 'CLEAR', dayType: null, exception: null },
      });
    }

    // mode === 'DAY_TYPE' (or dayType provided): persist an exception so the
    // resolved routine for this date changes to the selected day type.
    if (!dayType) {
      return NextResponse.json(
        { error: 'dayType is required for DAY_TYPE mode' },
        { status: 400 }
      );
    }

    const exception = await prisma.routineException.upsert({
      where: { userId_date: { userId: session.user.id, date } },
      create: {
        userId: session.user.id,
        date,
        dayType,
        templateId: templateId ?? null,
        note: reason ?? null,
        reason,
      },
      update: {
        dayType,
        templateId: templateId ?? null,
        note: reason ?? null,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        mode: 'DAY_TYPE',
        dayType,
        templateId: exception.templateId,
        exception: {
          id: exception.id,
          dayType: exception.dayType,
          templateId: exception.templateId,
          reason: exception.reason,
        },
      },
    });
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