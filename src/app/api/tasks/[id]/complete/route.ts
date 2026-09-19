import { auth } from '@/lib/auth';
import { TaskService } from '@/server/services/task.service';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/complete
 * Mark a task owned by the authenticated user as completed
 */
export async function POST(_request: NextRequest, context: RouteContext) {
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
    const task = await taskService.completeTask(session.user.id, id);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Error completing task:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  }
}