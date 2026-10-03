import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { handleError } from '@/lib/errors/error-handler';
import { goalCheckinSchema } from '@/schemas/goal.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/goals/[id]/checkin
 * Per-day check-off for DAILY goals. Records a dated progress log and sets
 * the absolute current value (1 = done, 0 = not done).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = goalCheckinSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await new GoalService().checkInDaily(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error saving goal check-in:', error);

    /**
     * `GoalService` raises `NotFoundError` / `ValidationError`, which `handleError`
     * maps to 404 / 400 with their own messages — the same shapes this route
     * used to build by hand. Everything else is masked in production instead of
     * having its message echoed back.
     */
    return handleError(error);
  }
}
