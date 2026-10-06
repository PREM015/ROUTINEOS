import { auth } from '@/lib/auth';
import { GoalService } from '@/server/services/goal.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';
import { handleError } from '@/lib/errors/error-handler';

const progressSchema = z.object({
  value: z.number(),
  note: z.string().optional(),
  autoComplete: z.boolean().optional(),
  /**
   * `'delta'` (default) adds `value` to the current total; `'set'` replaces it.
   *
   * This was missing from the schema, and a plain `z.object` **silently strips**
   * unknown keys — so the client, which sends `mode: 'set'` when the user drags
   * a progress slider, always fell through to the `'delta'` default. Dragging a
   * goal sitting at 10/100 to 50 stored **60**; dragging it to 20 stored 130.
   * Progress could only ever increase, and the second interaction saturated the
   * client-side clamp and auto-completed the goal. The service already
   * implemented `mode` correctly; the field simply never reached it.
   */
  mode: z.enum(['delta', 'set']).optional(),
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
    const validated = progressSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const goalService = new GoalService();
    const result = await goalService.updateProgress(
      userIdFromSession(session),
      id,
      validated.data.value,
      validated.data.note,
      validated.data.autoComplete,
      validated.data.mode
    );

    return NextResponse.json({
      success: true,
      data: result.goal,
      completed: result.completed,
    });
  } catch (error) {
    console.error('Error updating goal progress:', error);
    // `handleError` maps `NotFoundError` → 404 and `ValidationError` → 400.
    // The previous catch answered **400 for every Error**, so posting progress
    // to a goal the caller does not own reported "Goal not found" with a status
    // that tells the client to fix its request. Same fix as the sibling
    // `goals/[id]/route.ts`.
    return handleError(error);
  }
}