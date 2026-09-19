import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { calculateHabitEligibility } from '@/lib/habits/eligibility';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/habits/today
 * Get today's eligible habits with completion status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

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