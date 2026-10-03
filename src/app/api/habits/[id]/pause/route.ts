import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * The body is validated because `resumeDate` becomes a `HabitOverride.startDate`,
 * and `pauseHabit` defaults it from `new Date().toISOString()` — which is UTC.
 * A user in any zone east or west of Greenwich would get the habit resuming on
 * the wrong calendar day, silently, and the symptom ("it unpaused a day early")
 * looks like a scheduling bug rather than a missing schema check.
 */
const pauseSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
  resumeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'resumeDate must be YYYY-MM-DD')
    .nullish(),
});

/**
 * POST /api/habits/[id]/pause
 * Pause habit
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = pauseSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reason, resumeDate } = parsed.data;

    const habitService = new HabitService();
    await habitService.pauseHabit(session.user.id, id, reason ?? undefined, resumeDate ?? undefined);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error pausing habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to pause habit' },
      { status: 500 }
    );
  }
}