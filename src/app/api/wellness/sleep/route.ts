import { auth } from '@/lib/auth';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { wellnessQuerySchema } from '@/schemas/wellness.schema';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Sleep Insights Route
 * GET /api/wellness/sleep – analyze sleep over a date range using the
 *                           sleep-analyzer domain helpers
 */

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

function toSleepLogLike(log: {
  date: string;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  quality?: number | null;
  wakeUpCount?: number | null;
}): SleepLogLike | null {
  if (!log.actualBedtime || !log.actualWakeTime) return null;
  return {
    date: log.date,
    actualBedtime: log.actualBedtime,
    actualWakeTime: log.actualWakeTime,
    quality: log.quality,
    wakeUpCount: log.wakeUpCount,
  };
}

/**
 * GET /api/wellness/sleep
 * Return sleep analytics (averages, deficit, consistency, best/worst day,
 * score and phase type) for the date range, plus the raw logs.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = wellnessQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const range = defaultRange();
    const startDate = validated.data.startDate ?? range.startDate;
    const endDate = validated.data.endDate ?? range.endDate;

    const sleepRepository = new SleepRepository();
    const logs = await sleepRepository.findByRange(session.user.id, startDate, endDate);

    const sleepLike = logs
      .map(toSleepLogLike)
      .filter((log): log is SleepLogLike => log !== null);

    const userRepository = new UserRepository();
    const settings = await userRepository.getSettings(session.user.id);
    const targetMinutes = settings?.minSleepDuration ?? 480;

    const unPaginated = validated.data.limit === undefined;
    const offset = validated.data.offset ?? 0;
    const limit = validated.data.limit ?? 100;
    const paginated = unPaginated ? logs : logs.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        analysis: analyzeSleep(sleepLike, targetMinutes),
        logs: paginated,
      },
      meta: {
        total: logs.length,
        limit,
        offset,
        startDate,
        endDate,
        targetMinutes,
      },
    });
  } catch (error) {
    console.error('Error analyzing sleep:', error);
    return NextResponse.json({ error: 'Failed to analyze sleep' }, { status: 500 });
  }
}