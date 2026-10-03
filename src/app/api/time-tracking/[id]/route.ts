import { auth } from '@/lib/auth';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { updateTimeEntrySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Time Entry by ID Route
 * GET    /api/time-tracking/[id] – fetch one
 * PATCH  /api/time-tracking/[id] – update
 * DELETE /api/time-tracking/[id] – delete
 *
 * The existence check and the `endTime` → `duration` derivation both moved into
 * `TimeTrackingService`.
 */

/**
 * GET /api/time-tracking/[id]
 * Fetch a single time entry owned by the user
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await timeTrackingService.getForUser(session.user.id, paramId);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching time entry:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }
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
  const { id: paramId } = await params;
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

    const entry = await timeTrackingService.update(
      session.user.id,
      paramId,
      validated.data
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error updating time entry:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }
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
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await timeTrackingService.delete(session.user.id, paramId);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting time entry:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to delete time entry' }, { status: 500 });
  }
}
