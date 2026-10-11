import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { timeTrackingService } from '@/server/services/time-tracking.service';
import { updateTimeEntrySchema } from '@/schemas/time-tracking.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const entry = await timeTrackingService.getForUser(userIdFromSession(session), paramId);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return handleError(error);
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
      userIdFromSession(session),
      paramId,
      validated.data
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return handleError(error);
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

    const deleted = await timeTrackingService.delete(userIdFromSession(session), paramId);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    return handleError(error);
  }
}
