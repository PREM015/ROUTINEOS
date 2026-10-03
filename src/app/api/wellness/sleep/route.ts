import { auth } from '@/lib/auth';
import { wellnessService } from '@/server/services/wellness.service';
import { wellnessQuerySchema } from '@/schemas/wellness.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Wellness: Sleep Insights Route
 * GET /api/wellness/sleep – analyze sleep over a date range
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

    const { data, meta } = await wellnessService.getSleepAnalysis(userIdFromSession(session), {
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    return NextResponse.json({ success: true, data, meta });
  } catch (error) {
    console.error('Error analyzing sleep:', error);
    return NextResponse.json({ error: 'Failed to analyze sleep' }, { status: 500 });
  }
}
