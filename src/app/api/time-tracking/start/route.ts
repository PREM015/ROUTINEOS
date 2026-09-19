import { auth } from '@/lib/auth';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { startTimeEntrySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/time-tracking/start
 * Start the running timer. Conflicts with an already-running entry return 409.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = startTimeEntrySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new TimeEntryRepository();
    const running = await repository.findRunning(session.user.id);

    if (running) {
      return NextResponse.json(
        {
          error: 'A time entry is already running',
          details: { running },
        },
        { status: 409 }
      );
    }

    const entry = await repository.create(session.user.id, {
      description: validated.data.description,
      startTime: validated.data.startTime,
      projectId: validated.data.projectId,
      habitId: validated.data.habitId,
      goalId: validated.data.goalId,
      billable: validated.data.billable,
      rate: validated.data.rate,
      tags: validated.data.tags,
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error starting time entry:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to start time entry' }, { status: 500 });
  }
}