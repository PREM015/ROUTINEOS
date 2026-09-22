import { auth } from '@/lib/auth';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { updateTimeEntrySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/time-tracking/[id]
 * Fetch a single time entry owned by the user
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new TimeEntryRepository();
    const entry = await repository.findById(session.user.id, params.id);

    if (!entry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching time entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entry' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/time-tracking/[id]
 * Update a time entry owned by the user
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateTimeEntrySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new TimeEntryRepository();
    const existing = await repository.findById(session.user.id, params.id);

    if (!existing) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }

    let duration = validated.data.duration;
    if (duration === undefined && validated.data.endTime) {
      const startTime = validated.data.startTime ?? existing.startTime;
      if (startTime) {
        duration = Math.max(
          0,
          Math.round((validated.data.endTime.getTime() - startTime.getTime()) / 60000)
        );
      }
    }

    const entry = await repository.update(session.user.id, params.id, {
      description: validated.data.description,
      startTime: validated.data.startTime,
      endTime: validated.data.endTime,
      duration,
      projectId: validated.data.projectId,
      habitId: validated.data.habitId,
      goalId: validated.data.goalId,
      billable: validated.data.billable,
      rate: validated.data.rate,
      tags: validated.data.tags,
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error updating time entry:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update time entry' }, { status: 500 });
  }
}

/**
 * DELETE /api/time-tracking/[id]
 * Delete a time entry owned by the user
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new TimeEntryRepository();
    const existing = await repository.findById(session.user.id, params.id);

    if (!existing) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }

    const deleted = await repository.delete(session.user.id, params.id);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting time entry:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to delete time entry' }, { status: 500 });
  }
}