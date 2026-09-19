import { auth } from '@/lib/auth';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { updateFocusSessionSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/focus/[id]
 * Fetch a single focus session owned by the user
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const repository = new FocusRepository();
    const focusSession = await repository.findById(session.user.id, id);

    if (!focusSession) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    console.error('Error fetching focus session:', error);
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

    const repository = new FocusRepository();
    const existing = await repository.findById(session.user.id, id);

    if (!existing) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }

    const focusSession = await repository.update(id, session.user.id, {
      title: validated.data.title,
      description: validated.data.description,
      categoryId: validated.data.categoryId,
      plannedDuration: validated.data.plannedDuration,
      notes: validated.data.notes,
    });

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    console.error('Error updating focus session:', error);

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
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const repository = new FocusRepository();
    const existing = await repository.findById(session.user.id, id);

    if (!existing) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }

    const deleted = await repository.delete(session.user.id, id);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    console.error('Error deleting focus session:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to delete focus session' },
      { status: 500 }
    );
  }
}