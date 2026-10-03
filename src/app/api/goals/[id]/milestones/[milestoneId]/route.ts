import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const patchSchema = z.object({
  completed: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string; milestoneId: string }>;
}

/**
 * PATCH /api/goals/[id]/milestones/[milestoneId]
 * Mark a milestone complete, or reopen it.
 *
 * `completed: false` clears `completedAt` rather than deleting the row. A
 * milestone that can only be completed and never reopened is a one-way door: the
 * user who ticks the wrong box could only recover by deleting and re-creating it,
 * losing the description and due date.
 *
 * The goal id in the path is not decoration. It is the ownership check — the
 * service verifies that the goal belongs to the caller *and* that the milestone
 * belongs to that goal, because the repository method underneath takes only a
 * milestone id and cannot check anything on its own.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, milestoneId } = await context.params;
    if (typeof id !== 'string' || id.length === 0 || typeof milestoneId !== 'string') {
      return NextResponse.json({ error: 'Invalid goal id' }, { status: 400 });
    }

    const validated = patchSchema.safeParse(await request.json());
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const milestone = await new GoalService().setMilestoneComplete(
      session.user.id,
      id,
      milestoneId,
      validated.data.completed
    );

    return NextResponse.json({ success: true, data: milestone });
  } catch (error) {
    console.error('Error updating goal milestone:', error);
    return handleError(error);
  }
}

/**
 * DELETE /api/goals/[id]/milestones/[milestoneId]
 *
 * Gated exactly as the PATCH above — see {@link GoalService.deleteMilestone}.
 * It is scoped through the goal rather than trusted from the milestone id alone.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, milestoneId } = await context.params;
    if (typeof id !== 'string' || id.length === 0 || typeof milestoneId !== 'string') {
      return NextResponse.json({ error: 'Invalid goal id' }, { status: 400 });
    }

    await new GoalService().deleteMilestone(session.user.id, id, milestoneId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal milestone:', error);
    return handleError(error);
  }
}
