import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/routine/progress
 * Routine progress for a period (day/week/month/year), grouped per day.
 * Real data only: templates, exceptions, and logs of the authenticated user.
 */

const progressQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = progressQuerySchema.safeParse({
      period: searchParams.get('period') ?? 'week',
      date: searchParams.get('date') ?? undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const routineService = new RoutineService();
    const data = await routineService.getRoutineProgress(
      session.user.id,
      validated.data.period,
      validated.data.date
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching routine progress:", error);
    return NextResponse.json(
      { error: 'Failed to fetch routine progress' },
      { status: 500 }
    );
  }
}