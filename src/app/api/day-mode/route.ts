import { auth } from '@/lib/auth';
import { dayModeService } from '@/server/services/day-mode.service';
import { dayTypeSchema } from '@/lib/validation/routine.schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const dayModeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['MINIMUM', 'REST', 'DAY_TYPE', 'CLEAR']).optional(),
  dayType: dayTypeSchema.optional(),
  reason: z.string().optional(),
  templateId: z.string().optional(),
});

/**
 * GET /api/day-mode?date=YYYY-MM-DD
 * Return the resolved day type for a date: an explicit RoutineException (if one
 * exists) otherwise the natural weekday/weekend type, plus minimum/rest flags.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const snapshot = await dayModeService.getDayMode(session.user.id, date);

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Error fetching day mode:', error);
    return NextResponse.json(
      { error: 'Failed to fetch day mode' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/day-mode
 * Activate minimum day, rest day, set an explicit day type for a date (persists
 * a RoutineException so routine resolution changes), or clear a day-type
 * override back to the natural weekday/weekend schedule.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = dayModeSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, mode, dayType, reason, templateId } = validated.data;

    const result = await dayModeService.setDayMode(session.user.id, {
      date,
      mode: mode ?? 'DAY_TYPE',
      dayType,
      reason,
      templateId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error activating day mode:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to activate day mode' },
      { status: 500 }
    );
  }
}
