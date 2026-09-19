import { auth } from '@/lib/auth';
import { dailyBreakdown } from '@/server/analytics/daily';
import { weeklySummary } from '@/server/analytics/weekly';
import { monthlySummary } from '@/server/analytics/monthly';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { NextRequest, NextResponse } from 'next/server';
import { format, startOfWeek } from 'date-fns';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function mondayIso(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

function currentMonth(): string {
  return format(new Date(), 'yyyy-MM');
}

/**
 * GET /api/analytics/dashboard
 * Dashboard rollup for the day, current week, and current month.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || todayIso();

    const weekMonday = mondayIso();
    const month = currentMonth();

    const [today, week, monthSummary, habitCounts, goalCounts] = await Promise.all([
      dailyBreakdown(session.user.id, date),
      weeklySummary(session.user.id, weekMonday),
      monthlySummary(session.user.id, month),
      new HabitRepository().countByStatus(session.user.id),
      new GoalRepository().countByStatus(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        date,
        weekStart: weekMonday,
        month,
        today,
        week,
        month: monthSummary,
        counts: {
          habits: habitCounts,
          goals: goalCounts,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard analytics' },
      { status: 500 }
    );
  }
}