import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { getTodayString } from '@/lib/dates';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

const habitService = new HabitService();

/**
 * GET /api/habits/logs?date=YYYY-MM-DD
 *
 * Every habit log the user recorded on one date, across all habits.
 *
 * This endpoint exists because `GET /api/habits` cannot answer the question the
 * client was asking: `HabitRepository.findAll` includes
 * `_count: { select: { logs: true } }`, which is a *number*, not the log rows.
 * `AppContext` used to read `raw.logs` off that payload, so `habitLogs` was
 * always `[]` and every habit rendered as un-logged after a refresh — the
 * checkbox filled on click (via the optimistic insert) and then silently reset.
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
      getTodayString(await new UserService().getTimezone(userIdFromSession(session)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'date must be YYYY-MM-DD' },
        { status: 400 }
      );
    }

    const logs = await habitService.getLogsForDate(userIdFromSession(session), date);
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching habit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habit logs' },
      { status: 500 }
    );
  }
}
