import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { updateFocusSessionSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/focus/[id]
 * Fetch a single focus session owned by the user
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const focusSession = await focusService.getSession(session.user.id, id);

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    console.error('Error fetching focus session:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch focus session' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/focus/[id]
 * Update a focus session owned by the user
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const body = await request.json();
    const validated = updateFocusSessionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const focusSession = await focusService.updateSession(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    console.error('Error updating focus session:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to update focus session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/focus/[id]
 * Delete a focus session owned by the user
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const deleted = await focusService.deleteSession(session.user.id, id);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting focus session:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to delete focus session' },
      { status: 500 }
    );
  }
}
