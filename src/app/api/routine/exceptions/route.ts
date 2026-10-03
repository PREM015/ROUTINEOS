import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { dayTypeSchema, calendarDateSchema } from '@/lib/validation/routine.schema';
import { DAY_TYPE_CONFIG } from '@/constants/routine';
import type { DayOverride } from '@/types/routine';
import type { DayType } from '@/generated/prisma';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const routineService = new RoutineService();

/**
 * GET /api/routine/exceptions
 * List routine exceptions, optionally filtered to a single date.
 *
 * ## Narrowed on the way out
 *
 * The repository includes the related `template` and `dayTypeDef` rows because
 * `DayModeService` needs them, but this list renders neither, and both are
 * whole rows that would grow with the schema. The same `toBlockDto` reasoning
 * as `GET /api/routine`: the route hands the client exactly what it draws.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const requested = new URL(request.url).searchParams.get('date');

  /*
   * F8. This handler used to pass `?date` straight through to the repository
   * with no validation at all, so a malformed filter reached the query layer.
   * `calendarDateSchema` is the same rule the PUT body and the log schema use,
   * so a date means one thing across the whole routine surface now.
   */
  if (requested !== null && !calendarDateSchema.safeParse(requested).success) {
    return NextResponse.json(
      { error: 'Date must be in YYYY-MM-DD format' },
      { status: 400 }
    );
  }

  const records = await routineService.listExceptions(userIdFromSession(session), requested ?? undefined);

  const data: DayOverride[] = records.map((row) => ({
    date: row.date,
    // A definition's own name, because the enum collapses every user-defined
    // preset to `CUSTOM` and the list would otherwise read "Custom" throughout.
    dayTypeName: row.dayTypeDef?.name ?? DAY_TYPE_CONFIG[row.dayType as DayType]?.label ?? row.dayType,
    dayTypeColor: row.dayTypeDef?.color ?? DAY_TYPE_CONFIG[row.dayType as DayType]?.color ?? null,
    note: row.note,
  }));

  return NextResponse.json({ success: true, data });
}

const upsertExceptionSchema = z.object({
  date: calendarDateSchema,
  dayType: dayTypeSchema,
  templateId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

/**
 * PUT /api/routine/exceptions
 * Create or replace the per-date routine exception.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const validated = upsertExceptionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'A valid date and day type are required.' },
        { status: 400 }
      );
    }

    const data = await routineService.upsertException(userIdFromSession(session), {
      date: validated.data.date,
      dayType: validated.data.dayType,
      templateId: validated.data.templateId ?? null,
      note: validated.data.note ?? null,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('PUT /api/routine/exceptions error:', error);
    return NextResponse.json(
      { error: 'Failed to save routine exception.' },
      { status: 500 }
    );
  }
}
