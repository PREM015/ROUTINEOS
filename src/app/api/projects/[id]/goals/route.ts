import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const attachGoalSchema = z.object({
  goalId: z.string().uuid(),
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

    const userId = session.user.id;
    const projectRepository = new ProjectRepository();

    const project = await projectRepository.findById(userId, id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const goals = await projectRepository.getGoals(userId, id);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { projectId: id, total: goals.length },
    });
  } catch (error) {
    console.error('Error fetching project goals:', error);
    return NextResponse.json({ error: 'Failed to fetch project goals' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/goals
 * Attach an existing goal to the authenticated user's project
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

    const userId = session.user.id;
    const projectRepository = new ProjectRepository();
    const goalRepository = new GoalRepository();

    const project = await projectRepository.findById(userId, id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const goal = await goalRepository.findById(validated.data.goalId, userId);
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await goalRepository.update(validated.data.goalId, userId, {
      project: { connect: { id } },
    } as Prisma.GoalUpdateInput);

    const goals = await projectRepository.getGoals(userId, id);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { projectId: id, total: goals.length },
    });
  } catch (error) {
    console.error('Error attaching goal to project:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to attach goal to project' }, { status: 500 });
  }
}