import { auth } from '@/lib/auth';
import { ProjectService } from '@/server/services/project.service';
import { updateProjectSchema } from '@/schemas/project.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]
 * Fetch a single project owned by the authenticated user
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
    const project = await projectService.getProject(session.user.id, id);

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Error fetching project:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]
 * Update a project owned by the authenticated user
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const validated = updateProjectSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const projectService = new ProjectService();
    const project = await projectService.updateProject(session.user.id, id, validated.data);

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error('Error updating project:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Permanently delete a project owned by the authenticated user
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
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
    await projectService.deleteProject(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}