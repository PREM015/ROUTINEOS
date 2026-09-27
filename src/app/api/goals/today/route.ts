import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { UserService } from '@/server/services/user.service';
import { getTodayString } from '@/lib/dates';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/goals/today?date=YYYY-MM-DD
 *
 * Canonical "goals visible for a date" read. The visibility rule and the
 * day-type resolution both live in GoalService.getVisibleGoalsForDate (which
 * uses the shared resolver in lib/scheduling/resolve-routine), so /today,
 * /dashboard and /goals cannot disagree about which goals apply.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : getTodayString(await new UserService().getTimezone(userId));

    const goalService = new GoalService();
    const [{ goals, resolved }, progressLogs] = await Promise.all([
      goalService.getVisibleGoalsForDate(userId, date),
      goalService.getProgressLogsForDate(userId, date),
    ]);

    const latestProgressByGoal = new Map<string, number>();
    for (const log of progressLogs) {
      if (!latestProgressByGoal.has(log.goalId)) {
        latestProgressByGoal.set(log.goalId, log.value);
      }
    }

    return NextResponse.json({
      success: true,
      data: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        type: goal.type,
        priority: goal.priority,
        status: goal.status,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        unit: goal.unit,
        startDate: goal.startDate,
        endDate: goal.endDate,
        appliesEveryDay: goal.appliesEveryDay,
        loggedToday: latestProgressByGoal.get(goal.id) ?? null,
      })),
      meta: {
        date,
        dayType: resolved.dayType,
        dayTypeId: resolved.dayTypeId,
        dayTypeSource: resolved.source,
        total: goals.length,
      },
    });
  } catch (error) {
    console.error('Error fetching today\'s goals:', error);
    return NextResponse.json({ error: 'Failed to load goals' }, { status: 500 });
  }
}
