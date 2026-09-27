import { auth } from '@/lib/auth';
import { wellnessService } from '@/server/services/wellness.service';
import { wellnessQuerySchema } from '@/schemas/wellness.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Stats Route
 * GET /api/wellness/stats – aggregate mood, energy, and sleep analytics over a
 *                          date range with correlations and insights
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = wellnessQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await wellnessService.getWellnessStats(session.user.id, {
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error computing wellness stats:', error);
    return NextResponse.json({ error: 'Failed to compute wellness stats' }, { status: 500 });
  }
}
