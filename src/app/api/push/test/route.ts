import { auth } from '@/lib/auth';
import { pushService } from '@/server/services/push.service';
import { NextRequest, NextResponse } from 'next/server';
import { toUserId } from '@/types/ids';

interface TestNotificationData {
  userId: string;
  title: string;
  body?: string;
  url?: string;
}

/**
 * POST /api/push/test
 * Send a test push notification to the authenticated user's devices
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { title, body: notificationBody, url } = body as Partial<TestNotificationData>;

    /**
     * The target is the authenticated session, never a client-supplied id.
     *
     * This route used to require `userId` in the body and reject anything that
     * did not match the session, which pushed a "never trust client-supplied
     * userId" concern into every caller. The session is the only authority, so
     * `userId` is simply not read here.
     */
    const userId = session.user.id;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'A notification title is required' }, { status: 400 });
    }

    if (!pushService.enabled) {
      return NextResponse.json(
        {
          error:
            'Push notifications are not configured server-side. Both ' +
            'NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set.',
          details: { enabled: false, sent: 0, failed: 0 },
        },
        { status: 503 }
      );
    }

    const result = await pushService.sendToUser(toUserId(userId), {
      title,
      body: notificationBody,
      url,
      data: { test: true, timestamp: Date.now() },
    });

    /**
     * A "success" that delivered nothing is a failure for a *test* endpoint.
     * ERROR.md A5 asks for a real end-to-end check, so the response has to
     * distinguish "sent to your device" from "there was nothing to send to" and
     * say which, instead of returning `success: true` with `sent: 0` and leaving
     * the user to guess.
     */
    const delivered = result.sent > 0;
    if (!delivered) {
      return NextResponse.json(
        {
          error:
            result.reason ??
            'No registered devices. Enable push notifications on this device first.',
          details: {
            sent: result.sent,
            failed: result.failed,
            reason: result.reason ?? null,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sent: result.sent,
        failed: result.failed,
        ...(result.reason ? { reason: result.reason } : {}),
      },
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to send test notification' }, { status: 500 });
  }
}