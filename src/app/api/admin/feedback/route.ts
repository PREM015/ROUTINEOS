import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { UserRepository } from '@/server/repositories/user.repository';
import { FeedbackRepository } from '@/server/repositories/feedback.repository';
import {
  feedbackQuerySchema,
  updateFeedbackStatusSchema,
} from '@/schemas/feedback.schema';

/**
 * GET /api/admin/feedback
 * List feedback with optional type/status filters (admin only).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserRepository().findById(session.user.id);
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const validated = feedbackQuerySchema.safeParse({
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new FeedbackRepository();
    const query = {
      type: validated.data.type,
      status: validated.data.status,
      limit: validated.data.limit,
      offset: validated.data.offset,
    };
    const [items, total] = await Promise.all([
      repository.findAllPaginated(query),
      repository.count(query),
    ]);

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        total,
        limit: validated.data.limit ?? 20,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error listing feedback:', error);
    return NextResponse.json(
      { error: 'Failed to list feedback' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/feedback
 * Update the status of a feedback item (admin only).
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserRepository().findById(session.user.id);
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = updateFeedbackStatusSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new FeedbackRepository();
    const existing = await repository.findById(validated.data.id);
    if (!existing) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    const feedback = await repository.updateStatus(
      validated.data.id,
      validated.data.status
    );

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error updating feedback status:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback status' },
      { status: 500 }
    );
  }
}