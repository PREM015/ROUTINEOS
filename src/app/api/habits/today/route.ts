import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { HabitService } from '@/server/services/habit.service';
import { calculateHabitEligibility } from '@/lib/habits/eligibility';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { UserRepository } from '@/server/repositories/user.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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

    const userRepository = new UserRepository();
    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get('date') ||
      getTodayString((await userRepository.getSettings(session.user.id))?.timezone || DEFAULT_TZ);

    const habitRepository = new HabitRepository();

    // Get all active habits
    const habits = await habitRepository.findAll(session.user.id, {
      status: 'ACTIVE',
    });

    // Get today's logs
    const logs = await habitRepository.findLogsByDate(session.user.id, date);
    const logMap = new Map(logs.map(log => [log.habitId, log]));

    // Check eligibility and build response
    const todayHabits = await Promise.all(
      habits.map(async (habit) => {
        const eligibility = await calculateHabitEligibility(
          habit.id,
          session.user.id,
          date
        );

        return {
          id: habit.id,
          name: habit.name,
          tier: habit.tier,
          color: habit.color,
          icon: habit.icon,
          estimatedDuration: habit.estimatedDuration,
          targetCount: habit.targetCount,
          category: habit.category,
          isEligible: eligibility.isEligible,
          eligibilityReason: eligibility.isEligible ? undefined : eligibility.reason,
          source: eligibility.source,
          log: logMap.get(habit.id) || null,
        };
      })
    );

    // Filter to only eligible habits
    const eligibleHabits = todayHabits.filter(h => h.isEligible);

    return NextResponse.json({
      success: true,
      data: eligibleHabits,
    });
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
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to update habits' },
      { status: 500 }
    );
  }
}