import { z } from 'zod';
import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { TaskService } from '@/server/services/task.service';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';

const bulkDeleteSchema = z.object({
  type: z.enum(['habit', 'goal', 'task']),
  ids: z.array(z.string().min(1)).min(1).max(100),
});

interface BulkResult {
  id: string;
  success: boolean;
  error?: string;
}

/**
 * POST /api/bulk/delete
 * Permanently delete multiple habits, goals or tasks scoped to the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = bulkDeleteSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const { type, ids } = validated.data;

    const habitService = new HabitService();
    const goalService = new GoalService();
    const taskService = new TaskService();

    const results: BulkResult[] = [];
    for (const id of ids) {
      try {
        if (type === 'habit') {
          await habitService.deleteHabit(userId, id);
        } else if (type === 'goal') {
          await goalService.deleteGoal(userId, id);
        } else {
          await taskService.deleteTask(userId, id);
        }
        results.push({ id, success: true });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Delete failed',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      data: { results },
      meta: { type, total: results.length, succeeded, failed: results.length - succeeded },
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }
}