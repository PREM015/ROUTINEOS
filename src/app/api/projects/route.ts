import { z } from 'zod';
import { auth } from '@/lib/auth';
import { ProjectService } from '@/server/services/project.service';
import { createProjectSchema, projectQuerySchema } from '@/schemas/project.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

const goalIdsSchema = z.array(z.string().cuid()).max(50);

/**
 * GET /api/projects
 * Fetch the authenticated user's projects with optional query filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const queryData = {
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status')?.split(','),
      categoryId: searchParams.get('categoryId') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = projectQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const projectService = new ProjectService();
    const projects = await projectService.getProjects(userIdFromSession(session), validated.data);

    return NextResponse.json({
      success: true,
      data: projects,
      meta: {
        total: projects.length,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/projects
 * Create a project for the authenticated user, optionally attaching existing goals
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = (await request.json()) as Record<string, unknown>;
    const validated = createProjectSchema.safeParse(raw);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    let goalIds: string[] | undefined;
    if (raw.goalIds !== undefined) {
      const parsedGoalIds = goalIdsSchema.safeParse(raw.goalIds);
      if (!parsedGoalIds.success) {
        return NextResponse.json(
          { error: 'Invalid goalIds', details: parsedGoalIds.error.flatten() },
          { status: 400 }
        );
      }
      goalIds = parsedGoalIds.data;
    }

    const projectService = new ProjectService();
    const project = await projectService.createProject(userIdFromSession(session), {
      ...validated.data,
      goalIds,
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
