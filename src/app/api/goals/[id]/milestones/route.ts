import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { milestoneSchema } from '@/schemas/project.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/goals/[id]/milestones
 * List all milestones belonging to the authenticated user's goal
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid goal id' }, { status: 400 });
    }

    const milestones = await new GoalService().getMilestones(userIdFromSession(session), id);

    return NextResponse.json({
      success: true,
      data: milestones,
      meta: { goalId: id, total: milestones.length },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/goals/[id]/milestones
 * Create a milestone on the authenticated user's goal
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid goal id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = milestoneSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const milestone = await new GoalService().addMilestone(
      userIdFromSession(session),
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: milestone }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
