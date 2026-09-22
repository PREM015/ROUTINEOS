import { auth } from '@/lib/auth';
import { sleepService } from '@/server/services/sleep.service';
import { logSleepSchema } from '@/schemas/sleep.schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Sleep Route
 * GET  /api/sleep  – list sleep logs for a date range (optionally paginated)
 * POST /api/sleep  – log sleep for a date (upsert per user+date)
 *
 * Thin handlers: all logic lives in SleepService.
 */

const sleepQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * GET /api/sleep
 * Fetch sleep logs for the authenticated user. Pass `date` to fetch a single
 * day, otherwise `startDate`/`endDate` (defaults to the last 30 days in the
 * user's timezone).
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

    const { logs, total, startDate, endDate } = await sleepService.listLogs(
      session.user.id,
      validated.data
    );

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        total,
        limit: validated.data.limit ?? 100,
        offset: validated.data.offset ?? 0,
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
    const validated = logSleepSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const sleepLog = await sleepService.logSleep(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: sleepLog });
  } catch (error) {
    console.error('Error saving sleep log:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to save sleep log' }, { status: 500 });
  }
}