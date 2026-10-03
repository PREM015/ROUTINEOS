import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { logHabitSchema } from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { toUserId, userIdFromSession } from '@/types/ids';

/**
 * POST /api/habits/[id]/log
 * Log habit completion
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validated = logHabitSchema.safeParse({
      habitId: id,
      ...body,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const result = await habitService.logHabit(userIdFromSession(session), validated.data);

    /**
     * Recompute the day's score so `/today` reflects the tick immediately.
     *
     * The `DailyScore` row was previously only written by the nightly
     * `compute-daily-scores` cron, so the Score and Streak cards on `/today` kept
     * showing yesterday's numbers until the next morning — the client refetched
     * on `today-sync` and faithfully received the same stale row.
     *
     * Scoring reads habit logs, so this must run after the write. It is
     * fire-and-forget with a `.catch`: a scoring failure must not turn a
     * successful habit check into an error, and the next cron repairs any row
     * left behind.
     *
     * Dynamic import mirrors `SleepService` and avoids a service-level circular
     * import (`scoring.service` reads habit repositories).
     */
    void import('@/server/services/scoring.service')
      .then(({ ScoringService }) =>
        new ScoringService().recalculateDate(toUserId(session.user!.id!), validated.data.date)
      )
      .catch((error) => {
        console.error('Score recalculation failed after habit log:', error);
      });

    return NextResponse.json({
      success: true,
      data: {
        log: result.log,
        streakUpdated: result.streakUpdated,
        newStreak: result.newStreak,
      },
    });
  } catch (error) {
    console.error('Error logging habit:', error);

    /**
     * `HabitService` raises typed `AppError`s for every domain outcome the user
     * is meant to read (`Habit not found`, `Habit is not eligible for …`), and
     * `handleError` returns those messages verbatim with their own status.
     * Anything else — a Prisma failure, a dropped connection — is now masked as
     * `Internal server error` in production instead of being echoed back.
     */
    return handleError(error);
  }
}