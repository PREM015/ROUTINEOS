import { auth } from '@/lib/auth';
import { dayModeService } from '@/server/services/day-mode.service';
import { calendarDateSchema, dayTypeSchema } from '@/lib/validation/routine.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const dayModeSchema = z.object({
  date: calendarDateSchema,
  mode: z.enum(['MINIMUM', 'REST', 'DAY_TYPE', 'CLEAR']).optional(),
  dayType: dayTypeSchema.optional(),
  /**
   * Selects a specific custom day type. `dayType` alone cannot: the enum has
   * only six values and every user-defined day type collapses to `CUSTOM`, so
   * without this the choice was neither displayed nor restorable.
   */
  dayTypeId: z.string().min(1).optional(),
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
    const parsedDate = calendarDateSchema.safeParse(searchParams.get('date'));
    if (!parsedDate.success) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const date = parsedDate.data;

    const snapshot = await dayModeService.getDayMode(userIdFromSession(session), date);

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

    const { date, mode, dayType, dayTypeId, reason, templateId } = validated.data;

    const result = await dayModeService.setDayMode(userIdFromSession(session), {
      date,
      mode: mode ?? 'DAY_TYPE',
      dayType,
      dayTypeId,
      reason,
      templateId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error activating day mode:', error);
    return handleError(error);
  }
}
