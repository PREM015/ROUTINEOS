import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateGoalTagsSchema = z.object({
  tagIds: z.array(z.string().cuid()).max(50),
});

/**
 * GET /api/goals/[id]/tags
 * List the tags attached to the authenticated user's goal
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

    const tags = await new GoalService().getTags(userIdFromSession(session), id);

    return NextResponse.json({
      success: true,
      data: tags,
      meta: { goalId: id, total: tags.length },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/goals/[id]/tags
 * Replace all tags on the authenticated user's goal
 */
export async function PUT(request: NextRequest, context: RouteContext) {
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
    const validated = updateGoalTagsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const tags = await new GoalService().setTags(
      userIdFromSession(session),
      id,
      validated.data.tagIds
    );

    return NextResponse.json({
      success: true,
      data: tags,
      meta: { goalId: id, total: tags.length },
    });
  } catch (error) {
    return handleError(error);
  }
}
