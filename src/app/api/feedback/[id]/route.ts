import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { feedbackService } from '@/server/services/feedback.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { updateFeedbackSchema } from '@/schemas/feedback.schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/feedback/[id]
 * Fetch a single feedback submission owned by the user.
 *
 * Someone else's submission is reported as 404, not 403 — see
 * `FeedbackService.getOwn`.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid feedback id' }, { status: 400 });
    }

    const feedback = await feedbackService.getOwn(session.user.id, id);

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/feedback/[id]
 * Update a feedback submission owned by the user.
 *
 * This cannot change triage status — that is
 * `PATCH /api/admin/feedback/[id]`, which is admin-gated.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid feedback id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateFeedbackSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await feedbackService.updateOwn(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating feedback:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update feedback' },
      { status: 500 }
    );
  }
}
