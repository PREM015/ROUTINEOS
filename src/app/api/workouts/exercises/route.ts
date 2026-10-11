import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';

const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  muscleGroup: z.string().trim().max(64).nullable().optional(),
  equipment: z.string().trim().max(64).nullable().optional(),
});

/**
 * GET  /api/workouts/exercises — the caller's exercise library.
 * POST /api/workouts/exercises — add one.
 *
 * Idempotent on `(userId, name)`: re-posting an existing exercise returns the
 * existing row rather than a unique violation. Two users with a "Bench Press"
 * are two unrelated rows.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const exercises = await new CareerService().listExercises(
      auth.auth.userId,
      searchParams.get('includeArchived') === 'true'
    );

    return NextResponse.json({ success: true, data: exercises });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = createExerciseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const exercise = await new CareerService().createExercise(
      auth.auth.userId,
      parsed.data
    );

    return NextResponse.json({ success: true, data: exercise }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}