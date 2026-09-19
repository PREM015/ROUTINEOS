import { z } from 'zod';
import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { createHabitSchema, updateHabitSchema } from '@/schemas/habit.schema';
import { NextRequest, NextResponse } from 'next/server';

const bulkHabitsSchema = z.object({
  create: z.array(createHabitSchema).max(100).optional(),
  update: z
    .array(z.object({ id: z.string().uuid(), data: updateHabitSchema }))
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
 * POST /api/habits/bulk
 * Bulk create, update and delete habits for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = bulkHabitsSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const userId = session.user.id;

    const created: BulkOutput[] = [];
    for (const input of validated.data.create ?? []) {
      try {
        const habit = await habitService.createHabit(userId, input);
        created.push({ id: habit.id, success: true, data: habit });
      } catch (error) {
        created.push({
          id: '',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create habit',
        });
      }
    }

    const updated: BulkOutput[] = [];
    for (const { id, data } of validated.data.update ?? []) {
      try {
        const habit = await habitService.updateHabit(userId, id, data);
        updated.push({ id, success: true, data: habit });
      } catch (error) {
        updated.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update habit',
        });
      }
    }

    const deleted: BulkOutput[] = [];
    for (const id of validated.data.delete ?? []) {
      try {
        await habitService.deleteHabit(userId, id);
        deleted.push({ id, success: true });
      } catch (error) {
        deleted.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete habit',
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
    console.error('Error in bulk habit operation:', error);
    return NextResponse.json({ error: 'Bulk habit operation failed' }, { status: 500 });
  }
}