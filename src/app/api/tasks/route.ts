import { auth } from '@/lib/auth';
import { TaskService } from '@/server/services/task.service';
import { createTaskSchema, taskQuerySchema } from '@/schemas/task.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/tasks
 * Fetch the authenticated user's tasks with optional query filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const queryData = {
      status: searchParams.get('status')?.split(','),
      priority: searchParams.get('priority')?.split(','),
      projectId: searchParams.get('projectId') || undefined,
      goalId: searchParams.get('goalId') || undefined,
      parentTaskId: searchParams.get('parentTaskId') || undefined,
      search: searchParams.get('search') || undefined,
      dueBefore: searchParams.get('dueBefore') || undefined,
      dueAfter: searchParams.get('dueAfter') || undefined,
      overdue: searchParams.get('overdue') === 'true' || undefined,
      isUrgent: searchParams.get('isUrgent') === 'true' || undefined,
      isImportant: searchParams.get('isImportant') === 'true' || undefined,
      includeCompleted: searchParams.get('includeCompleted') === 'true' || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = taskQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const taskService = new TaskService();
    const tasks = await taskService.getTasks(session.user.id, validated.data);

    return NextResponse.json({
      success: true,
      data: tasks,
      meta: {
        total: tasks.length,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

/**
 * POST /api/tasks
 * Create a task for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTaskSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const taskService = new TaskService();
    const task = await taskService.createTask(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}