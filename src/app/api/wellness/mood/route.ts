import { auth } from '@/lib/auth';
import { wellnessService } from '@/server/services/wellness.service';
import { logMoodSchema, moodQuerySchema } from '@/schemas/mood.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Wellness: Mood Route
 * GET  /api/wellness/mood – list mood logs with optional range/pagination and
 *                          a mood summary
 * POST /api/wellness/mood – log a mood check-in
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

    const { data, summary, meta } = await wellnessService.getMoodLogs(
      userIdFromSession(session),
      {
        startDate: validated.data.startDate,
        endDate: validated.data.endDate,
        limit: validated.data.limit,
        offset: validated.data.offset,
      }
    );

    return NextResponse.json({ success: true, data, meta, summary });
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

    const log = await wellnessService.logMood(userIdFromSession(session), validated.data);

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error('Error logging mood:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to log mood' }, { status: 500 });
  }
}
