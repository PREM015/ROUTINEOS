import { auth } from '@/lib/auth';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { completeFocusSessionSchema } from '@/schemas/focus.schema';
import { completeSession } from '@/lib/focus/session-manager';
import type { FocusTimerSnapshot } from '@/types/focus';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/focus/[id]/complete
 * Complete a focus session: set completedAt and the actual duration computed
 * from the pomodoro timer timebox.
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

    const repository = new FocusRepository();
    const focusSession = await repository.findById(session.user.id, id);

    if (!focusSession) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }

    if (focusSession.completedAt) {
      return NextResponse.json(
        { error: 'Focus session already completed' },
        { status: 400 }
      );
    }

    const plannedSeconds = focusSession.plannedDuration * 60;
    const snapshot: FocusTimerSnapshot = {
      sessionId: focusSession.id,
      state: 'RUNNING',
      startedAt: focusSession.startedAt,
      endsAt: new Date(focusSession.startedAt.getTime() + plannedSeconds * 1000),
      elapsedSeconds: 0,
      remainingSeconds: plannedSeconds,
      progressPercentage: 0,
    };

    const completion = completeSession(snapshot);
    const actualDuration = Math.max(1, Math.round(completion.durationSeconds / 60));

    const completed = await repository.completeSession(session.user.id, id, {
      actualDuration,
      focusRating: validated.data.focusRating,
      productivityRating: validated.data.productivityRating,
      difficultyRating: validated.data.difficultyRating,
      energyAfter: validated.data.energyAfter,
      distractions: validated.data.distractions,
      notes: validated.data.notes,
    });

    return NextResponse.json({ success: true, data: completed });
  } catch (error) {
    console.error('Error completing focus session:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to complete focus session' },
      { status: 500 }
    );
  }
}