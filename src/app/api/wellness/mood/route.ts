import { auth } from '@/lib/auth';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { logMoodSchema, moodQuerySchema } from '@/schemas/mood.schema';
import { analyzeMood, type MoodLogLike } from '@/lib/wellness/mood-analytics';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Mood Route
 * GET  /api/wellness/mood – list mood logs with optional range/pagination and
 *                          a mood summary (computed with mood-analytics helpers)
 * POST /api/wellness/mood – log a mood check-in
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

function toMoodLogLike(log: {
  timestamp: Date;
  mood: number;
  energy?: number | null;
}): MoodLogLike {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    mood: log.mood,
    energy: log.energy,
    timestamp: log.timestamp.toISOString(),
  };
}

/**
 * GET /api/wellness/mood
 * List mood logs over a date range. Includes `summary` (average/distribution/
 * trend via analyzeMood) for today when available, otherwise for the period.
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
      mood: searchParams.get('mood') ? parseInt(searchParams.get('mood')!, 10) : undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: (searchParams.get('sortOrder') ?? undefined) as 'asc' | 'desc' | undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = moodQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const range = defaultRange();
    const from = validated.data.startDate ?? range.startDate;
    const to = validated.data.endDate ?? range.endDate;

    const moodRepository = new MoodRepository();
    const logs = await moodRepository.getMoodRange(session.user.id, from, to);

    const today = toDateString(new Date());
    const todayLogs = logs.filter(log => toDateString(log.timestamp) === today);
    const summary = analyzeMood((todayLogs.length > 0 ? todayLogs : logs).map(toMoodLogLike));

    const offset = validated.data.offset ?? 0;
    const limit = validated.data.limit ?? 30;
    const paginated = logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      meta: {
        total: logs.length,
        limit,
        offset,
        startDate: from,
        endDate: to,
      },
      summary,
    });
  } catch (error) {
    console.error('Error fetching mood logs:', error);
    return NextResponse.json({ error: 'Failed to fetch mood logs' }, { status: 500 });
  }
}

/**
 * POST /api/wellness/mood
 * Log a new mood check-in.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = logMoodSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const moodRepository = new MoodRepository();
    const log = await moodRepository.logMood(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error('Error logging mood:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to log mood' }, { status: 500 });
  }
}