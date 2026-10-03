import { auth } from '@/lib/auth';
import { sleepSessionService } from '@/server/services/sleep-session.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/sleep/session/stop – stop the active sleep session and persist
 *                                a SleepLog for the wake date.
 *
 * ## Why the body accepts reported times
 *
 * The button that calls this is "I woke up". Pressing it says only *that the
 * user is now interacting*, never *when they actually woke*. Someone who ignored
 * the 05:00 alarm presses it at 09:00; someone who never presses it at all never
 * calls this endpoint. Deriving `actualWakeTime` from the request time silently
 * turned both cases into false data.
 *
 * Both fields are optional so a bare `{}` still works — the service falls back to
 * the session clock — but the client is expected to ask first and send what the
 * user reported.
 *
 * Stopping when nothing is running is a state conflict, not a missing
 * resource: the endpoint exists and answered correctly. 409 keeps it out of
 * the "endpoint not found" bucket in request logs and monitoring.
 */

const stopBodySchema = z
  .object({
    bedtime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Bedtime must be HH:mm')
      .optional(),
    wakeTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Wake time must be HH:mm')
      .optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // An absent or empty body is valid and means "no reported times". A body
    // that is present but malformed is a 400 rather than a silent fallback.
    const raw = await request.text();
    let actual: { bedtime?: string; wakeTime?: string } = {};
    if (raw.trim().length > 0) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const result = stopBodySchema.safeParse(parsedBody);
      if (!result.success) {
        return NextResponse.json(
          { error: 'Invalid sleep times', details: result.error.flatten() },
          { status: 400 }
        );
      }
      actual = result.data;
    }

    const data = await sleepSessionService.stopSleep(userIdFromSession(session), new Date(), actual);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'No active sleep session') {
      return NextResponse.json(
        { error: error.message, details: { reason: 'no_active_session' } },
        { status: 409 }
      );
    }
    console.error('Error stopping sleep session:', error);
    return NextResponse.json(
      { error: 'Failed to stop sleep session' },
      { status: 500 }
    );
  }
}
