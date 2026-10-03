import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

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

    const tags = await new GoalService().getTags(session.user.id, id);

    return NextResponse.json({
      success: true,
      data: tags,
      meta: { goalId: id, total: tags.length },
    });
  } catch (error) {
    console.error('Error fetching goal tags:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch goal tags' }, { status: 500 });
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
      session.user.id,
      id,
      validated.data.tagIds
    );

    return NextResponse.json({
      success: true,
      data: tags,
      meta: { goalId: id, total: tags.length },
    });
  } catch (error) {
    console.error('Error updating goal tags:', error);

    if (error instanceof NotFoundError) {
      // `NotFoundError` carries either "Goal" or "Tag <id>", so the message
      // distinguishes a missing goal from a tag the caller does not own — the
      // same distinction the route drew inline.
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update goal tags' }, { status: 500 });
  }
}
