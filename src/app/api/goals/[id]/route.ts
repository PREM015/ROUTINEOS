import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { updateGoalSchema } from '@/schemas/goal.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    // The other three verbs in this file already went through `GoalService`; this
    // one was the remaining direct repository read.
    const goal = await new GoalService().getGoal(session.user.id, id);

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('Error fetching goal:', error);
    return NextResponse.json({ error: 'Failed to fetch goal' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = updateGoalSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const goal = await goalService.updateGoal(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('Error updating goal:', error);
    // `handleError` maps `NotFoundError` → 404 and `ValidationError` → 400 with
    // their own messages. The previous catch answered **400 for every Error**,
    // so `PUT /api/goals/{bogus}` reported "Goal not found" with a status that
    // tells the client to fix its request.
    return handleError(error);
  }
}

/**
 * DELETE /api/goals/[id]
 *
 * `?impact=true` returns what the delete would cost **without** performing it.
 *
 * This is not a dry-run convenience. `Task.goalId` and `TimeEntry.goalId` both
 * lack an `onDelete`, so the real delete detaches those rows rather than
 * cascading them — which means tasks survive and only lose their goal. That is a
 * materially different outcome from "cascades", and the user is entitled to
 * read it before agreeing to something irreversible.
 *
 * The preview is a separate verb rather than an always-present `meta` block on
 * `GET` because the counts cost six queries, and the list view reads a hundred
 * goals.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const goalService = new GoalService();

    if (request.nextUrl.searchParams.get('impact') === 'true') {
      const impact = await goalService.getDeleteImpact(session.user.id, id);
      return NextResponse.json({ success: true, data: impact });
    }

    await goalService.deleteGoal(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return handleError(error);
  }
}

/**
 * PATCH /api/goals/[id]
 * Partial update alias (progress updates, status changes).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return PUT(request, { params: Promise.resolve({ id }) });
}