import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { getTodayString } from '@/lib/dates';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { logRoutineBlockTodaySchema, calendarDateSchema } from '@/lib/validation/routine.schema';
import { EditWindowError } from '@/lib/routine/edit-window';
import { ValidationError } from '@/lib/errors/app-error';
import { toUserId, userIdFromSession } from '@/types/ids';

/**
 * GET /api/routine/today?date=YYYY-MM-DD
 * The resolved schedule for one date.
 *
 * This is the *only* read the routine page needs. It previously returned no
 * score information, so the page issued a second request for the same date to
 * find out whether the day was a rest day - two identical fetches of one
 * resource, which is what the duplicated-polling smell was.
 *
 * `date` is validated rather than trusted: an unvalidated `?date=` was passed
 * straight into `getRoutineForDate`, where it is used as a `YYYY-MM-DD` key in a
 * `findMany` where-clause.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requested = new URL(request.url).searchParams.get('date');
    let date: string;

    if (requested) {
      // F8: the shared schema, not a fourth local spelling of the same regex.
      // This is the one the POST body already validates with, so the query
      // string and the body can no longer disagree about what a date is.
      if (!calendarDateSchema.safeParse(requested).success) {
        return NextResponse.json(
          { error: 'Date must be in YYYY-MM-DD format' },
          { status: 400 }
        );
      }
      date = requested;
    } else {
      date = getTodayString(await new UserService().getTimezone(userIdFromSession(session)));
    }

    const routine = await new RoutineService().getRoutineForDate(userIdFromSession(session), date);

    return NextResponse.json({
      success: true,
      data: routine,
    });
  } catch (error) {
    console.error("Error fetching today's routine:", error);
    return NextResponse.json(
      { error: 'Failed to fetch routine' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routine/today
 * Record how a block went for a date, or clear the record entirely.
 *
 * Upserts one log per (user, block, date), so ticking never creates duplicates.
 * Accepts every `RoutineLog` column and all four `RoutineLogStatus` members;
 * see `logRoutineBlockTodaySchema` for what each field buys.
 *
 * Responds `200` rather than `201`: the resource is a *singleton per
 * (block, date)*, so a repeated submission updates it. Answering `201` for an
 * upsert told every caller that a second one was a duplicate.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = logRoutineBlockTodaySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const { blockId, date, status, clear, ...rest } = validated.data;

    try {
      const log = await new RoutineService().logBlockStatus(toUserId(userId), {
        blockId,
        date,
        clear,
        ...(status && { status }),
        ...rest,
      });
      return NextResponse.json({ success: true, data: log }, { status: 200 });
    } catch (error) {
      if (error instanceof EditWindowError) {
        // The window is closed. 403, not 400 - see `toErrorResponse` in
        // `app/api/routine/route.ts` for why the distinction matters.
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error logging routine block:', error);
    return NextResponse.json(
      { error: 'Failed to log routine block' },
      { status: 500 }
    );
  }
}