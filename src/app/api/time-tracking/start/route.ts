import { auth } from '@/lib/auth';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { ConflictError } from '@/lib/errors/app-error';
import { startTimeEntrySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/time-tracking/start
 * Start the running timer. Conflicts with an already-running entry return 409,
 * and the response body is unchanged: the conflicting entry is still echoed back
 * under `details.running`.
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

    const entry = await timeTrackingService.start(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error starting time entry:', error);

    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 409 }
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to start time entry' }, { status: 500 });
  }
}
