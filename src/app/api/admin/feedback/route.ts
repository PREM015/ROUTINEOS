import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { feedbackService } from '@/server/services/feedback.service';
import { AuthorizationError, NotFoundError } from '@/lib/errors/app-error';
import {
  feedbackQuerySchema,
  updateFeedbackStatusSchema,
} from '@/schemas/feedback.schema';
import { userIdFromSession } from '@/types/ids';

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

    const { items, total } = await feedbackService.listAllForAdmin(userIdFromSession(session), {
      type: validated.data.type,
      status: validated.data.status,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

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
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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

    const body = await request.json();
    const validated = updateFeedbackStatusSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const feedback = await feedbackService.updateStatus(
      userIdFromSession(session),
      validated.data.id,
      validated.data.status
    );

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error updating feedback status:', error);
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update feedback status' },
      { status: 500 }
    );
  }
}
