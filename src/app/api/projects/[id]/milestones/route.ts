import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ProjectService } from '@/server/services/project.service';
import { milestoneSchema } from '@/schemas/project.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const createProjectMilestoneSchema = z.object({ goalId: z.string().uuid() }).merge(
  milestoneSchema
);

/**
 * GET /api/projects/[id]/milestones
 * List the milestones belonging to the authenticated user's project goals
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

    const projectService = new ProjectService();
    const milestones = await projectService.getMilestones(session.user.id, id);

    return NextResponse.json({
      success: true,
      data: milestones,
      meta: { projectId: id, total: milestones.length },
    });
  } catch (error) {
    console.error('Error fetching project milestones:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to fetch project milestones' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/milestones
 * Add a milestone to a goal within the authenticated user's project
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
    const validated = createProjectMilestoneSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { goalId, ...milestone } = validated.data;

    const projectService = new ProjectService();
    const created = await projectService.addMilestone(session.user.id, id, goalId, milestone);

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('Error creating project milestone:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to create project milestone' }, { status: 500 });
  }
}