import { auth } from '@/lib/auth';
import { insightReadService } from '@/server/services/insight.service';
import type { InsightPeriod } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const period = new URL(request.url).searchParams.get('period') as
      | InsightPeriod
      | null;

    const insight = await insightReadService.getLatestInsight(
      userIdFromSession(session),
      period ?? undefined
    );

    return NextResponse.json({
      success: true,
      data: insight,
    });
  } catch (error) {
    console.error('Error fetching latest insight:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insight' },
      { status: 500 }
    );
  }
}
