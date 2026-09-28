import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';
import { UserService } from '@/server/services/user.service';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';

const scoringService = new ScoringService();

/**
 * The user's "today" for score bucketing.
 *
 * Both handlers previously defaulted to `new Date().toISOString().slice(0, 10)`
 * — the **UTC** date, with no timezone lookup at all. For a user at
 * `America/Los_Angeles` at 17:00 local on the 28th that is the 29th, so
 * "today's score" read tomorrow's row: the card showed zero for the last seven
 * hours of every day, and the POST wrote a `DailyScore` for a day that had not
 * started.
 */
async function todayFor(sessionUserId: string): Promise<string> {
  const timezone = await new UserService()
    .getTimezone(sessionUserId)
    .catch(() => DEFAULT_TZ);
  return getTodayString(timezone);
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requested = searchParams.get('date');
    const today = await todayFor(session.user.id);
    const date = requested || today;

    // Same reasoning as `/api/score/[date]`: today's inputs can still change, so
    // today is re-derived; a past date is history and is served as stored.
    const existing = await scoringService.getDailyScore(session.user.id, date);
    const score =
      date === today
        ? await scoringService.recalculateDate(session.user.id, date)
        : (existing ?? (await scoringService.calculateDailyScore(session.user.id, date)));

    // `{ success, data }` envelope, matching every other route. This returned a
    // bare row, which is why `CoreScoreWidget` and `TodayScore` had grown
    // divergent unwrapping workarounds.
    return NextResponse.json({ success: true, data: score });
  } catch (error) {
    console.error('[SCORE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Force recalculate. A `date` is accepted so a client can recompute a past
    // day; the default is the user's today, not UTC.
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || (await todayFor(session.user.id));

    const score = await scoringService.calculateDailyScore(session.user.id, date);

    return NextResponse.json({ success: true, data: score });
  } catch (error) {
    console.error('[SCORE_RECALC]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
