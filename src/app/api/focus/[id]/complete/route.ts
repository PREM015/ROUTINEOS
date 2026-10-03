import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { completeFocusSessionSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/focus/[id]/complete
 * Complete a focus session: set completedAt and the actual duration computed
 * from the pomodoro timer timebox.
 *
 * The timer snapshot and the duration floor moved into
 * `FocusService.completeSession`, so any surface that completes a session
 * records the same figure.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // No body is valid — completion only requires the session itself
    }

    const validated = completeFocusSessionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const completed = await focusService.completeSession(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: completed });
  } catch (error) {
    console.error('Error completing focus session:', error);

    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to complete focus session' },
      { status: 500 }
    );
  }
}
