import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { dayTypeSchema } from '@/lib/validation/routine.schema';
import { z } from 'zod';

const routineService = new RoutineService();

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/routine/exceptions
 * List routine exceptions, optionally filtered to a single date.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = new URL(request.url).searchParams.get('date') ?? undefined;
  const records = await routineService.listExceptions(session.user.id, date);

  return NextResponse.json({ success: true, data: records });
}

const upsertExceptionSchema = z.object({
  date: z.string().regex(DATE, 'Date must be YYYY-MM-DD'),
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

    const data = await routineService.upsertException(session.user.id, {
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
