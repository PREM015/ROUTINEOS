import { auth } from '@/lib/auth';
import { dayTypePlanningService } from '@/server/services/day-type-planning.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/today/tomorrow-plan
 * Get tomorrow's DayType plan
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plan = await dayTypePlanningService.getTomorrowPlan(userIdFromSession(session));
    const dayTypes = await dayTypePlanningService.getAvailableDayTypes(userIdFromSession(session));

    return NextResponse.json({
      success: true,
      data: {
        plan,
        availableDayTypes: dayTypes,
      },
    });
  } catch (error) {
    console.error('Error getting tomorrow plan:', error);
    return NextResponse.json(
      { error: 'Failed to get tomorrow plan' },
      { status: 500 }
    );
  }
}