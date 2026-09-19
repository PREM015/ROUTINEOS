import { auth } from '@/lib/auth';
import { TaskService } from '@/server/services/task.service';
import { TaskRepository } from '@/server/repositories/task.repository';
import { TaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/archive
 * Archive (or restore with ?restore=true) a task owned by the authenticated user
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const restore = searchParams.get('restore') === 'true';

    const userId = session.user.id;

    if (restore) {
      const taskRepository = new TaskRepository();
      const task = await taskRepository.updateStatus(userId, id, TaskStatus.TODO);
      return NextResponse.json({ success: true, data: task });
    }

    const taskService = new TaskService();
    const task = await taskService.archiveTask(userId, id);

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error('Error archiving task:', error);

    if (error instanceof Error) {
      const status = error.message.toLowerCase().includes('not found') ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ error: 'Failed to archive task' }, { status: 500 });
  }
}