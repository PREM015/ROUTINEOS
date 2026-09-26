import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const healthQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional(),
});

/**
 * GET /api/habits/health?days=28
 * Aggregate habit health for the active user's habits over a rolling window:
 * per-habit completion rate + a healthy/at-risk/unhealthy classification, plus
 * a summary. Real data computed from habit logs.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = healthQuerySchema.safeParse({
      days: searchParams.get('days') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const health = await new HabitService().getHabitHealth(
      session.user.id,
      parsed.data.days ?? 28
    );

    return NextResponse.json({ success: true, data: health });
  } catch (error) {
    console.error('Error fetching habit health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habit health' },
      { status: 500 }
    );
  }
}