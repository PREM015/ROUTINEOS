import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { FeedbackRepository } from '@/server/repositories/feedback.repository';
import { updateFeedbackSchema } from '@/schemas/feedback.schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/feedback/[id]
 * Fetch a single feedback submission owned by the user.
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

    const feedback = await new FeedbackRepository().findById(id);
    if (!feedback || feedback.userId !== session.user.id) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/feedback/[id]
 * Update a feedback submission owned by the user.
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

    const repository = new FeedbackRepository();
    const updated = await repository.updateOwn(id, session.user.id, validated.data);
    if (!updated) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback' },
      { status: 500 }
    );
  }
}