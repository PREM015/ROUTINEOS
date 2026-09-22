import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/routine/today
 * Get today's routine
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const routineService = new RoutineService();
    const routine = await routineService.getRoutineForDate(session.user.id, date);

    return NextResponse.json({
      success: true,
      data: routine,
    });
  } catch (error) {
    console.error('Error fetching today\'s routine:', error);
    return NextResponse.json(
      { error: 'Failed to fetch routine' },
      { status: 500 }
    );
  }
}

const logBlockSchema = z.object({
  blockId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['COMPLETED', 'PARTIAL', 'MISSED']),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/routine/today
 * Mark a routine block done (or not) for a date. Upserts one log per
 * (user, block, date) so toggling never creates duplicates.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = logBlockSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const { blockId, date, status, note } = validated.data;

    const block = await db.routineBlock.findFirst({
      where: { id: blockId, userId },
      select: { id: true },
    });
    if (!block) {
      return NextResponse.json({ error: 'Routine block not found' }, { status: 404 });
    }

    const log = await db.routineLog.upsert({
      where: { userId_routineBlockId_date: { userId, routineBlockId: blockId, date } },
      create: { userId, routineBlockId: blockId, date, status, note },
      update: { status, note },
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error("Error logging routine block:", error);
    return NextResponse.json(
      { error: 'Failed to log routine block' },
      { status: 500 }
    );
  }
}