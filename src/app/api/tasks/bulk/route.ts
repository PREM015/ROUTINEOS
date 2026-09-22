import { z } from 'zod';
import { auth } from '@/lib/auth';
import { TaskService } from '@/server/services/task.service';
import { createTaskSchema, updateTaskSchema } from '@/schemas/task.schema';
import { NextRequest, NextResponse } from 'next/server';

const bulkTasksSchema = z.object({
  create: z.array(createTaskSchema).max(100).optional(),
  update: z
    .array(z.object({ id: z.string().cuid(), data: updateTaskSchema }))
    .max(100)
    .optional(),
  delete: z.array(z.string().cuid()).max(100).optional(),
});

interface BulkOutput {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * POST /api/tasks/bulk
 * Bulk create, update and delete tasks for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = bulkTasksSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const taskService = new TaskService();
    const userId = session.user.id;

    const createdCount = validated.data.create?.length
      ? await taskService.bulkCreate(userId, validated.data.create)
      : 0;

    const updated: BulkOutput[] = [];
    for (const { id, data } of validated.data.update ?? []) {
      try {
        const task = await taskService.updateTask(userId, id, data);
        updated.push({ id, success: true, data: task });
      } catch (error) {
        updated.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update task',
        });
      }
    }

    const deleted: BulkOutput[] = [];
    for (const id of validated.data.delete ?? []) {
      try {
        await taskService.deleteTask(userId, id);
        deleted.push({ id, success: true });
      } catch (error) {
        deleted.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete task',
        });
      }
    }

    const failed = [...updated, ...deleted].filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      data: { createdCount, updated, deleted },
      meta: {
        total: createdCount + updated.length + deleted.length,
        failed,
      },
    });
  } catch (error) {
    console.error('Error in bulk task operation:', error);
    return NextResponse.json({ error: 'Bulk task operation failed' }, { status: 500 });
  }
}