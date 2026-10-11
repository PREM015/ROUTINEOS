import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const attachGoalSchema = z.object({
  goalId: z.string().cuid(),
});

/**
 * GET /api/projects/[id]/goals
 * List the goals belonging to the authenticated user's project
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    const goals = await new GoalService().getProjectGoals(userIdFromSession(session), id);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { projectId: id, total: goals.length },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/projects/[id]/goals
 * Attach an existing goal to the authenticated user's project
 *
 * The `project: { connect }` write is a goal update, so it happens inside
 * `GoalService` rather than being handed to `GoalRepository` from here.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = attachGoalSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goals = await new GoalService().attachToProject(
      userIdFromSession(session),
      id,
      validated.data.goalId
    );

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { projectId: id, total: goals.length },
    });
  } catch (error) {
    return handleError(error);
  }
}
