// TODO: Implement route.ts
import { auth } from '@/lib/auth';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { calculateSleepDuration, calculateSleepDeficit } from '@/lib/sleep/calculate-duration';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const sleepLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetBedtime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  targetWakeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  actualBedtime: z.string().regex(/^\d{2}:\d{2}$/),
  actualWakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  quality: z.number().int().min(1).max(5).optional(),
  wakeUpCount: z.number().int().min(0).optional(),
  feltRested: z.boolean().optional(),
  moodOnWaking: z.number().int().min(1).max(5).optional(),
  energyOnWaking: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/sleep
 * Get sleep log for date
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter required' },
        { status: 400 }
      );
    }

    const sleepRepository = new SleepRepository();
    const sleepLog = await sleepRepository.findByDate(session.user.id, date);

    return NextResponse.json({
      success: true,
      data: sleepLog,
    });
  } catch (error) {
    console.error('Error fetching sleep log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sleep log' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sleep
 * Create or update sleep log
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = sleepLogSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, ...logData } = validated.data;

    // Calculate duration
    const actualDurationMinutes = calculateSleepDuration(
      logData.actualBedtime,
      logData.actualWakeTime
    );

    // Calculate deficit if target is available
    let deficitMinutes: number | undefined;
    if (logData.targetBedtime && logData.targetWakeTime) {
      const targetDuration = calculateSleepDuration(
        logData.targetBedtime,
        logData.targetWakeTime
      );
      deficitMinutes = calculateSleepDeficit(actualDurationMinutes, targetDuration);
    }

    const sleepRepository = new SleepRepository();
    const sleepLog = await sleepRepository.upsertLog(session.user.id, date, {
      user: { connect: { id: session.user.id } },
      date,
      ...logData,
      actualDurationMinutes,
      deficitMinutes,
    });

    return NextResponse.json({
      success: true,
      data: sleepLog,
    });
  } catch (error) {
    console.error('Error saving sleep log:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to save sleep log' },
      { status: 500 }
    );
  }
}