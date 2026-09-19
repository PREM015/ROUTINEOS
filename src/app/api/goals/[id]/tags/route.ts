import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { TagRepository } from '@/server/repositories/tag.repository';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateGoalTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).max(50),
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

    const goalRepository = new GoalRepository();
    const goal = await goalRepository.findWithRelations(id, session.user.id);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: goal.tags,
      meta: { goalId: id, total: goal.tags.length },
    });
  } catch (error) {
    console.error('Error fetching goal tags:', error);
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

    const userId = session.user.id;
    const goalRepository = new GoalRepository();
    const tagRepository = new TagRepository();

    const goal = await goalRepository.findById(id, userId);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const tagIds = [...new Set(validated.data.tagIds)];
    for (const tagId of tagIds) {
      const tag = await tagRepository.findById(userId, tagId);
      if (!tag) {
        return NextResponse.json({ error: `Tag not found: ${tagId}` }, { status: 404 });
      }
    }

    await goalRepository.update(id, userId, {
      tags: {
        deleteMany: {},
        create: tagIds.map((tagId) => ({ tagId })),
      },
    } as Prisma.GoalUpdateInput);

    const updated = await goalRepository.findWithRelations(id, userId);

    return NextResponse.json({
      success: true,
      data: updated?.tags,
      meta: { goalId: id, total: updated?.tags.length ?? 0 },
    });
  } catch (error) {
    console.error('Error updating goal tags:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update goal tags' }, { status: 500 });
  }
}