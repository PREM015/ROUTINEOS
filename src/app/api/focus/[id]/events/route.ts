import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusEventInputSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { handleError } from '@/lib/errors/error-handler';
import { userIdFromSession } from '@/types/ids';

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
    const events = await focusService.listEvents(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    return handleError(error);
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

    await focusService.logEvent(userIdFromSession(session), id, parsed.data);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
