import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';
import { UserRepository } from '@/server/repositories/user.repository';
import { getTodayString } from '@/lib/dates';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

const scoringService = new ScoringService();
const userRepository = new UserRepository();

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/scores/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Get daily scores for a date range (ascending by date).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const validated = dateRangeSchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid date range', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { startDate, endDate } = validated.data;
    const scores = await scoringService.getDailyScoreRange(
      userIdFromSession(session),
      startDate,
      endDate
    );

    /*
      Fill the gap the cron cannot.

      `compute-daily-scores` runs at 01:00, so the row for TODAY is only written
      tomorrow morning. That made the whole day invisible: the user completes
      habits, reloads, and the dashboard Consistency grid still shows an empty cell
      for the date they just worked on — with no way to tell "not scored" from
      "not yet run".

      So today is computed on read when it is missing. The score is derived
      entirely from existing rows (habit logs, routine logs, sleep), so this is a
      read that caches, not a second source of truth. It is deliberately scoped to
      today only:
        - the past is the cron's job, and backfilling it here would turn a page
          load into hundreds of writes;
        - the future has no data to score.
    */
    // The user's own zone, not the host's: a 10pm job in Berlin is still today in
    // Los Angeles, and the grid's "today" ring is drawn from the same value.
    // `UserSettings.timezone` is the authoritative column for every date-bucketing
    // read; `User.timezone` is a mirror kept in sync by `UserService`.
    const settings = await userRepository.getSettings(userIdFromSession(session));
    const today = getTodayString(settings?.timezone ?? 'UTC');
    if (endDate >= today && startDate <= today) {
      const alreadyScored = scores.some((s) => s.date === today);
      if (!alreadyScored) {
        try {
          const fresh = await scoringService.recalculateDate(userIdFromSession(session), today);
          scores.push(fresh);
          scores.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        } catch (error) {
          /*
            Non-fatal. A read endpoint that cannot afford one extra calculation
            should still return the 365 rows it already has, and the grid renders
            today's cell as a skeleton - which is honest, because that is what the
            data actually says.
          */
          console.error('Could not compute today’s score on read:', error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: scores,
    });
  } catch (error) {
    console.error('Error fetching daily scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily scores' },
      { status: 500 }
    );
  }
}
