import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';

const reviewSchema = z.object({
  /** `true` resets the schedule to the start of the interval table. */
  forgotten: z.boolean().optional(),
});

/**
 * POST /api/problems/[id]/review
 *
 * Record a spaced-repetition review and reschedule the next one.
 *
 * `forgotten: true` sends the problem back to the front of the queue rather than
 * advancing it — remembering something once is not having learned it, and a
 * schedule that only ever lengthens is not spaced repetition.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const parsed = reviewSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const problem = await new CareerService().reviewProblem(
      auth.auth.userId,
      id,
      parsed.data
    );

    return NextResponse.json({ success: true, data: problem });
  } catch (error) {
    return handleError(error);
  }
}