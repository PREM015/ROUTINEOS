import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  /** Defaults to five minutes, which is what the "+5" button sends. */
  seconds: z.number().int().min(60).max(4 * 3600).optional(),
});

/**
 * POST /api/focus/[id]/extend
 *
 * Adds to `extendedSeconds`, not `plannedDuration`. That distinction is the whole
 * reason this endpoint exists rather than a PATCH on the session: overwriting the
 * plan would make "planned versus actual" permanently unable to detect a session
 * the user had to extend, which is the signal estimate-accuracy analytics is built
 * on.
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
      // No body means the default five minutes.
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const extended = await focusService.extendSession(
      session.user.id,
      id,
      parsed.data.seconds ?? 5 * 60
    );
    return NextResponse.json({ success: true, data: extended });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error extending focus session:', error);
    return NextResponse.json({ error: 'Failed to extend focus session' }, { status: 500 });
  }
}
