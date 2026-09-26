import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InsightRepository } from '@/server/repositories/insight.repository';

const insightParamsSchema = z.object({
  id: z.string().min(1),
});

const insightRepository = new InsightRepository();

/**
 * DELETE /api/analytics/insights/[id]
 * Dismiss an AI insight from the dashboard by permanently removing its row.
 * Ownership is enforced by the caller's session; the insight must belong to
 * the authenticated user (or nothing is deleted).
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const validated = insightParamsSchema.safeParse({ id });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid insight id', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    await insightRepository.deleteOwned(session.user.id, validated.data.id);

    return NextResponse.json({ success: true, data: { id: validated.data.id } });
  } catch (error) {
    console.error('Error dismissing insight:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss insight' },
      { status: 500 }
    );
  }
}