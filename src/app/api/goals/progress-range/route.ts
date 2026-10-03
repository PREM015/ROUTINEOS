import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

/**
 * Bounded so a malformed or absent `from` cannot ask for the entire history
 * table. 365 days comfortably covers the widest strip the UI draws (30) with
 * room for a coarser range later, and the cap is enforced here rather than
 * trusted from the client.
 */
const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const MAX_RANGE_DAYS = 365;

/**
 * GET /api/goals/progress-range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Every `GoalProgress` row across the caller's goals in a half-open
 * `[from, to)` calendar-day range.
 *
 * This exists so the consistency strips and streaks on `/goals` cost **one**
 * request for the whole page. Each strip is 30 days wide and there is one per
 * goal, so the obvious implementation — `GET /api/goals/[id]/history` per goal —
 * was fifteen round trips before the first card had a streak, and it grew
 * linearly with the list.
 *
 * `to` is exclusive so a caller can pass "tomorrow" and get a range that
 * includes today without doing date arithmetic itself.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = rangeSchema.safeParse({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { from, to } = parsed.data;

    if (to <= from) {
      return NextResponse.json({ error: '`to` must be after `from`' }, { status: 400 });
    }

    const spanDays =
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000;

    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Range must not exceed ${MAX_RANGE_DAYS} days` },
        { status: 400 }
      );
    }

    const rows = await new GoalService().getProgressRange(userIdFromSession(session), from, to);

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        goalId: row.goalId,
        value: row.value,
        // Serialised to a calendar label. `GoalProgress.date` is a DateTime and
        // Prisma renders it as an instant; the consumer's day arithmetic is all
        // done on labels, and handing it an ISO instant is how a check-in for
        // "today" silently lands on the previous day for anyone west of UTC.
        date: row.date.toISOString().slice(0, 10),
        note: row.note,
      })),
      meta: { from, to, total: rows.length },
    });
  } catch (error) {
    console.error('Error fetching goal progress range:', error);
    return handleError(error);
  }
}