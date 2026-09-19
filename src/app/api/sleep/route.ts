import { auth } from '@/lib/auth';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { calculateSleepDuration, calculateSleepDeficit } from '@/lib/sleep/calculate-duration';
import { LogSleepSchema } from '@/schemas/sleep.schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Sleep Route
 * GET  /api/sleep  – list sleep logs for a date range (optionally paginated)
 * POST /api/sleep  – log sleep for a date (upsert per user+date)
 */

const sleepQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

/**
 * GET /api/sleep
 * Fetch sleep logs for the authenticated user. Pass `date` to fetch a single
 * day, otherwise `startDate`/`endDate` (defaults to the last 30 days).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      date: searchParams.get('date') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = sleepQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const sleepRepository = new SleepRepository();

    if (validated.data.date) {
      const sleepLog = await sleepRepository.findByDate(session.user.id, validated.data.date);
      return NextResponse.json({
        success: true,
        data: sleepLog ? [sleepLog] : [],
        meta: { total: sleepLog ? 1 : 0 },
      });
    }

    const range = defaultRange();
    const startDate = validated.data.startDate ?? range.startDate;
    const endDate = validated.data.endDate ?? range.endDate;
    const logs = await sleepRepository.findByRange(session.user.id, startDate, endDate);

    const total = logs.length;
    const offset = validated.data.offset ?? 0;
    const limit = validated.data.limit ?? 100;
    const paginated = logs.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      meta: {
        total,
        limit,
        offset,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching sleep logs:', error);
    return NextResponse.json({ error: 'Failed to fetch sleep logs' }, { status: 500 });
  }
}

/**
 * POST /api/sleep
 * Log sleep for a date. Creating or updating the log for the given user+date.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = LogSleepSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, bedtime, wakeTime, quality, notes } = validated.data;

    const actualDurationMinutes = calculateSleepDuration(bedtime, wakeTime);
    const deficitMinutes = calculateSleepDeficit(actualDurationMinutes, 480);

    const sleepRepository = new SleepRepository();
    const sleepLog = await sleepRepository.upsertLog(session.user.id, date, {
      actualBedtime: bedtime,
      actualWakeTime: wakeTime,
      actualDurationMinutes,
      deficitMinutes,
      quality,
      notes,
    });

    return NextResponse.json({ success: true, data: sleepLog });
  } catch (error) {
    console.error('Error saving sleep log:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to save sleep log' }, { status: 500 });
  }
}