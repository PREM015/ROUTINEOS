import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { handleError } from '@/lib/errors/error-handler';
import { getTodayString } from '@/lib/dates';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const habitService = new HabitService();

/**
 * GET /api/habits/today
 * Get today's eligible habits with completion status. Scheduled habits land
 * here via their frequency schedule; ad-hoc inclusions (added manually for the
 * date) are flagged with source: 'MANUAL'.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get('date') ||
      getTodayString(await new UserService().getTimezone(session.user.id));

    const data = await habitService.getHabitsForDate(session.user.id, date);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching today\'s habits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habits' },
      { status: 500 }
    );
  }
}

const dayAddRemoveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(['ADD', 'REMOVE']),
  habitId: z.string().min(1),
});

/**
 * POST /api/habits/today
 * Add (or remove) a habit to/from today's list manually. The habit must be one
 * the user owns; ADD persists a day-scoped RESCHEDULE override, REMOVE clears
 * it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = dayAddRemoveSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, action, habitId } = validated.data;
    const habitService = new HabitService();

    if (action === 'ADD') {
      await habitService.addHabitToToday(session.user.id, habitId, date);
    } else {
      await habitService.removeHabitFromToday(session.user.id, habitId, date);
    }

    return NextResponse.json({
      success: true,
      data: { date, action, habitId },
    });
  } catch (error) {
    console.error('Error updating today\'s habits:', error);
    return handleError(error);
  }
}
