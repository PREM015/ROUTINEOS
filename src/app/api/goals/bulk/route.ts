import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { createGoalSchema, updateGoalSchema } from '@/schemas/goal.schema';
import { NextRequest, NextResponse } from 'next/server';

const bulkGoalsSchema = z.object({
  create: z.array(createGoalSchema).max(100).optional(),
  update: z
    .array(z.object({ id: z.string().uuid(), data: updateGoalSchema }))
    .max(100)
    .optional(),
  delete: z.array(z.string().uuid()).max(100).optional(),
});

interface BulkOutput {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * POST /api/goals/bulk
 * Bulk create, update and delete goals for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = bulkGoalsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const userId = session.user.id;

    const created: BulkOutput[] = [];
    for (const input of validated.data.create ?? []) {
      try {
        const goal = await goalService.createGoal(userId, input);
        created.push({ id: goal.id, success: true, data: goal });
      } catch (error) {
        created.push({
          id: '',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create goal',
        });
      }
    }

    const updated: BulkOutput[] = [];
    for (const { id, data } of validated.data.update ?? []) {
      try {
        const goal = await goalService.updateGoal(userId, id, data);
        updated.push({ id, success: true, data: goal });
      } catch (error) {
        updated.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update goal',
        });
      }
    }

    const deleted: BulkOutput[] = [];
    for (const id of validated.data.delete ?? []) {
      try {
        await goalService.deleteGoal(userId, id);
        deleted.push({ id, success: true });
      } catch (error) {
        deleted.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete goal',
        });
      }
    }

    const failed = [...created, ...updated, ...deleted].filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      data: { created, updated, deleted },
      meta: {
        total: created.length + updated.length + deleted.length,
        failed,
      },
    });
  } catch (error) {
    console.error('Error in bulk goal operation:', error);
    return NextResponse.json({ error: 'Bulk goal operation failed' }, { status: 500 });
  }
}