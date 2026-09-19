import { auth } from '@/lib/auth';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { milestoneSchema } from '@/schemas/project.schema';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

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

    const goalRepository = new GoalRepository();
    const goal = await goalRepository.findById(id, session.user.id);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const milestones = await goalRepository.getMilestones(id);

    return NextResponse.json({
      success: true,
      data: milestones,
      meta: { goalId: id, total: milestones.length },
    });
  } catch (error) {
    console.error('Error fetching goal milestones:', error);
    return NextResponse.json({ error: 'Failed to fetch goal milestones' }, { status: 500 });
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

    const goalRepository = new GoalRepository();
    const userId = session.user.id;

    const goal = await goalRepository.findById(id, userId);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const existing = await goalRepository.getMilestones(id);
    const milestone = await goalRepository.createMilestone({
      goal: { connect: { id } },
      title: validated.data.title,
      description: validated.data.description,
      targetValue: validated.data.targetValue,
      dueDate: validated.data.dueDate,
      sortOrder: existing.length,
    } as Prisma.MilestoneCreateInput);

    return NextResponse.json({ success: true, data: milestone }, { status: 201 });
  } catch (error) {
    console.error('Error creating goal milestone:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create goal milestone' }, { status: 500 });
  }
}