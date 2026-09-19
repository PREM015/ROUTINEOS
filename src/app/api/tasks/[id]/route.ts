import { auth } from '@/lib/auth';
import { TaskService } from '@/server/services/task.service';
import { updateTaskSchema } from '@/schemas/task.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]
 * Fetch a single task owned by the authenticated user
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    const taskService = new TaskService();
    const task = await taskService.getTask(session.user.id, id);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Error fetching task:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks/[id]
 * Update a task owned by the authenticated user
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateTaskSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const taskService = new TaskService();
    const task = await taskService.updateTask(session.user.id, id, validated.data);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Error updating task:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]
 * Permanently delete a task owned by the authenticated user
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    const taskService = new TaskService();
    await taskService.deleteTask(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}