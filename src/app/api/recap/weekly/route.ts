import { auth } from '@/lib/auth';
import { generateWeeklyRecap } from '@/server/recap/weekly';
import { userService } from '@/server/services/user.service';
import { handleError } from '@/lib/errors/error-handler';
import { DEFAULT_TZ, getTodayString, getWeekRange } from '@/lib/dates';
import { resolveWeekStartsOn } from '@/lib/period-range';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userIdFromSession(session);
    const { searchParams } = new URL(request.url);
    let weekStart = searchParams.get('weekStart');
    let weekEnd = searchParams.get('weekEnd');

    // Default to the current week in the user's timezone, honouring their
    // `weekStartsOn`. The previous default built the week from the server's
    // local date and forced a Monday start, so it disagreed with the week the
    // rest of the app (recap, analytics) shows the user.
    if (!weekStart || !weekEnd) {
      const settings = await userService.getSettings(userId);
      const timezone = settings.timezone || DEFAULT_TZ;
      const { start, end } = getWeekRange(
        getTodayString(timezone),
        resolveWeekStartsOn(settings.weekStartsOn)
      );
      weekStart = weekStart ?? start;
      weekEnd = weekEnd ?? end;
    }

    const recap = await generateWeeklyRecap(userId, weekStart, weekEnd);

    return NextResponse.json({
      success: true,
      data: recap,
    });
  } catch (error) {
    return handleError(error);
  }
}
