import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';
import { handleError } from '@/lib/errors/error-handler';

const carryOverSchema = z.object({
  newEndDate: z.coerce.date(),
  adjustProgress: z.boolean().optional(),
});

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
    const validated = carryOverSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const newGoal = await goalService.carryOverGoal(
      userIdFromSession(session),
      id,
      validated.data.newEndDate,
      validated.data.adjustProgress
    );

    return NextResponse.json({ success: true, data: newGoal });
  } catch (error) {
    console.error('Error carrying over goal:', error);
    // `handleError` maps `NotFoundError` → 404 and `ValidationError` → 400.
    // The previous catch answered **400 for every Error**, so carrying over a
    // goal the caller does not own reported "Goal not found" with a status that
    // tells the client its request was malformed. Same fix as the sibling
    // `goals/[id]/route.ts`.
    return handleError(error);
  }
}