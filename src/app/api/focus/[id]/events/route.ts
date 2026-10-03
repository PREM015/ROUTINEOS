import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusEventInputSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/focus/[id]/events — the ordered lifecycle timeline for the detail sheet.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const events = await focusService.listEvents(session.user.id, id);
    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    console.error('Error listing focus events:', error);
    return NextResponse.json({ error: 'Failed to list focus events' }, { status: 500 });
  }
}

/**
 * POST /api/focus/[id]/events — capture a distraction or a note mid-session.
 *
 * This is the "parking lot": the thought that would otherwise cost the user their
 * focus. It has to be one tap, because anything more expensive than that gets
 * skipped at exactly the moment it is needed, which is while the distraction is
 * happening.
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
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const parsed = focusEventInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await focusService.logEvent(session.user.id, id, parsed.data);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Focus session not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error logging focus event:', error);
    return NextResponse.json({ error: 'Failed to log focus event' }, { status: 500 });
  }
}
