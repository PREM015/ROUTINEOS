import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { ValidationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Insight by ID Route
 * DELETE /api/analytics/insights/[id]
 *
 * Thin handler; ownership is enforced by `InsightRepository.deleteOwned`.
 */

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    await analyticsService.dismissInsight(userIdFromSession(session), id);

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error dismissing insight:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to dismiss insight' }, { status: 500 });
  }
}
