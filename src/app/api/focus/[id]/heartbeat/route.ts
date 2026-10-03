import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/focus/[id]/heartbeat
 *
 * "I am still watching this." That is the entire contract, and the recovery rules
 * treat it as a **lower bound on presence, never as permission to claim time**.
 *
 * That asymmetry is deliberate and is the safety property of the whole recovery
 * design. If heartbeats were authoritative, a client that kept posting them would
 * manufacture focus minutes on a session it had abandoned — the number would stop
 * meaning anything. Because they only ever *narrow* the ambiguity (they rule out
 * "the tab was gone", they never rule out "the work did not happen"), the worst a
 * buggy or malicious client can do is make the server *more* willing to credit a
 * deadline it had already decided had passed.
 *
 * Returns 204 with no body. The client already knows the session is running, and
 * echoing the row every minute would be a payload it parses for no information.
 * A 204 on an already-ended session is correct, not an error: the client raced
 * its own completion, and there is nothing to fix.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await focusService.heartbeat(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error recording focus heartbeat:', error);
    return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 });
  }
}
