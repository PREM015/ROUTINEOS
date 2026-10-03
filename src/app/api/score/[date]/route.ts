import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';
import { UserService } from '@/server/services/user.service';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { userIdFromSession } from '@/types/ids';

const scoringService = new ScoringService();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date } = await params;

    /**
     * ERROR.md A2: today's score must be accurate and in sync.
     *
     * This used to be `existing ?? calculateDailyScore(...)`, so once a row
     * existed it was returned forever and never re-derived. Any change that did
     * not happen to pass through `HabitService`/`RoutineService` — a weight
     * change, a habit edited or deleted, a routine block re-ordered, a settings
     * change to the scoring weights — left a stale number on screen that the user
     * could not reconcile with the inputs they could see.
     *
     * Today is therefore always recomputed, which is cheap (a handful of indexed
     * reads) and is the only date whose inputs can still change. Past dates are
     * history and are served as stored, so the score shown for a finished day does
     * not silently mutate. Recalculation is idempotent, so a no-op change costs
     * only a read.
     */
    const timezone = await new UserService()
      .getTimezone(userIdFromSession(session))
      .catch(() => DEFAULT_TZ);
    const isToday = date === getTodayString(timezone);

    const score = isToday
      ? await scoringService.recalculateDate(userIdFromSession(session), date)
      : ((await scoringService.getDailyScore(userIdFromSession(session), date)) ??
        (await scoringService.calculateDailyScore(userIdFromSession(session), date)));

    // Enveloped per the project-wide contract (`FILE.MD`):
    //   success -> { success: true, data }, error -> { error }
    // This used to return the bare score row, so `TodayScore`'s
    // `if (data.success)` guard never passed and the card permanently rendered
    // 0 / Grade F. `CoreScoreWidget` was reading the raw shape to compensate,
    // so the two surfaces disagreed.
    return NextResponse.json({ success: true, data: score });
  } catch (error) {
    console.error('[SCORE_DATE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
