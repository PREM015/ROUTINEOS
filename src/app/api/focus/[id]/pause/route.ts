import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    /**
     * Why the pause happened.
     *
     * The distinction is the point, not a nicety: "I paused" is a deliberate
     * interruption the user chose, and "sleep" is the system doing it for them.
     * Without a recorded reason the timeline cannot tell an intentional break from
     * a lost evening, and interruption analytics would be meaningless.
     */
    reason: z.enum(['manual', 'sleep', 'interruption', 'recovery']).optional(),
  })
  .default({});

/**
 * POST /api/focus/[id]/pause
 *
 * Idempotent. Pausing an already-paused session returns it unchanged rather than
 * moving `pausedAt` forward — that would silently discard the paused span and
 * shorten the session by however long the user had been waiting.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // A pause needs no arguments.
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const paused = await focusService.pauseSession(userIdFromSession(session), id, parsed.data.reason);
    return NextResponse.json({ success: true, data: paused });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error pausing focus session:', error);
    return NextResponse.json({ error: 'Failed to pause focus session' }, { status: 500 });
  }
}
