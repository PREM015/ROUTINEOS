import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { feedbackService } from '@/server/services/feedback.service';
import { createFeedbackSchema, feedbackQuerySchema } from '@/schemas/feedback.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/feedback
 * List the authenticated user's feedback submissions.
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

    const { items, total } = await feedbackService.listOwn(userIdFromSession(session), {
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
    return NextResponse.json(
      { error: 'Failed to list feedback' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feedback
 * Submit feedback as the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createFeedbackSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const feedback = await feedbackService.create(userIdFromSession(session), validated.data);

    return NextResponse.json(
      { success: true, data: feedback },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to create feedback' },
      { status: 500 }
    );
  }
}
