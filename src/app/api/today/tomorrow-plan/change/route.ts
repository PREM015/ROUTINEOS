import { auth } from '@/lib/auth';
import { dayTypePlanningService } from '@/server/services/day-type-planning.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const changeSchema = z.object({
  dayTypeId: z.string().min(1),
});

/**
 * POST /api/today/tomorrow-plan/change
 * Change tomorrow's DayType after confirmation (regenerates routine & notifications)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = changeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const result = await dayTypePlanningService.changeTomorrowPlan(
      userIdFromSession(session),
      parsed.data
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error changing tomorrow day type:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to change day type' },
      { status: 500 }
    );
  }
}