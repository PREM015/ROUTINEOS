import { auth } from '@/lib/auth';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { createTimeEntrySchema, timeTrackingQuerySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/time-tracking
 * Fetch time entries for the authenticated user with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const billableParam = searchParams.get('billable');
    const queryData = {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      goalId: searchParams.get('goalId') || undefined,
      habitId: searchParams.get('habitId') || undefined,
      billable:
        billableParam === 'true' ? true : billableParam === 'false' ? false : undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = timeTrackingQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // `entries` + `total` are fetched together in the service, so the row count
    // and the page can never come from two different queries that disagree.
    const { entries, total } = await timeTrackingService.listForUser(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({
      success: true,
      data: entries,
      meta: {
        total,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entries' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/time-tracking
 * Create a new manual time entry
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTimeEntrySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const entry = await timeTrackingService.create(userIdFromSession(session), {
      description: validated.data.description,
      startTime: validated.data.startTime,
      endTime: validated.data.endTime ?? undefined,
      duration: validated.data.duration,
      projectId: validated.data.projectId ?? undefined,
      habitId: validated.data.habitId ?? undefined,
      goalId: validated.data.goalId ?? undefined,
      billable: validated.data.billable,
      rate: validated.data.rate,
      tags: validated.data.tags,
      isAutomatic: validated.data.isAutomatic,
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating time entry:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create time entry' }, { status: 500 });
  }
}
