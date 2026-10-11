import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';

const createSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  habitId: z.string().cuid().nullable().optional(),
  durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  isRestDay: z.boolean().optional(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().cuid(),
        notes: z.string().max(500).nullable().optional(),
        /*
         * A set belongs to the exercise it is nested under, so it carries no id
         * of its own. The server attaches it to the `WorkoutSessionExercise` row
         * it writes, which is what makes a client unable to point a set at
         * another user's exercise.
         */
        sets: z.array(
          z.object({
            setNumber: z.number().int().min(1).max(100),
            reps: z.number().int().min(0).max(1000).nullable().optional(),
            weightKg: z.number().min(0).max(1000).nullable().optional(),
            rpe: z.number().int().min(1).max(10).nullable().optional(),
            isWarmup: z.boolean().optional(),
            notes: z.string().max(300).nullable().optional(),
          })
        ),
      })
    )
    .default([]),
});

/**
 * GET /api/workouts/sessions — the caller's training log.
 * POST /api/workouts/sessions — log a session with its sets.
 *
 * `userId` comes from `requireSession` and is not accepted in the body. The
 * service re-checks every `habitId` and `exerciseId` against the caller's own
 * rows, so a payload naming another user's exercise fails with 404 rather than
 * writing a session that links to it.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const sessions = await new CareerService().listSessions(auth.auth.userId, {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      habitId: searchParams.get('habitId') ?? undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit') as string, 10)
        : undefined,
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = createSessionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const session = await new CareerService().createSession(
      auth.auth.userId,
      parsed.data
    );

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}