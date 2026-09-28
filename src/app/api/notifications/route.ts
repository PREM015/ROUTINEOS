import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Minimum gap between catch-up attempts, per user.
 *
 * The catch-up runs a real dispatch (several queries, and a push send when
 * something is genuinely due). Running it on every single navigation would be
 * wasteful, but it does not need to be prompt either: the GitHub Actions ticker
 * handles the timely case, and this only has to clear the backlog left by a
 * missed tick.
 */
const CATCH_UP_THROTTLE_MS = 5 * 60 * 1000;

/**
 * In-memory record of the last catch-up per user.
 *
 * Deliberately not persisted. This is a rate limiter, not source of truth: if
 * the process restarts or a second server instance handles the request, the worst
 * case is one extra idempotent dispatch, which is harmless because
 * `markSent` is guarded on `status = PENDING`.
 */
const lastCatchUp = new Map<string, number>();

/**
 * GET /api/notifications
 * The user's recent notifications plus the unread badge count.
 *
 * ## Catch-up dispatch
 *
 * Also runs a throttled `dispatchDueNotifications()` for this user before
 * responding. This is the self-healing layer for the free architecture:
 *
 *   * The GitHub Actions ticker is the primary driver, but GitHub can delay a
 *     scheduled workflow or be briefly unavailable.
 *   * `dispatchDueNotifications` selects everything with `scheduledFor <= now`,
 *     so anything the ticker missed is still deliverable.
 *   * Therefore an outage of any length results in a **late** notification
 *     rather than a **lost** one, and the backlog clears the moment the user
 *     opens the app.
 *
 * It runs *after* the read so notification latency is unaffected, and failures
 * are swallowed so a dispatch problem can never break the notification list.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)
    );

    const [notifications, unreadCount] = await Promise.all([
      notificationService.getNotifications(userId, { limit }),
      notificationService.getUnreadCount(userId),
    ]);

    void runCatchUp(userId);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * Dispatch anything overdue for this user, at most once per throttle window.
 *
 * Never rejects: a catch-up failure is logged and the next attempt retries.
 */
async function runCatchUp(userId: string): Promise<void> {
  const now = Date.now();
  const previous = lastCatchUp.get(userId);
  if (previous !== undefined && now - previous < CATCH_UP_THROTTLE_MS) {
    return;
  }

  // Record before awaiting, so concurrent requests in the same tick do not all
  // fire a dispatch at once.
  lastCatchUp.set(userId, now);

  // Keep the map from growing without bound on a long-lived instance.
  if (lastCatchUp.size > 5_000) {
    for (const [key, at] of lastCatchUp) {
      if (now - at > CATCH_UP_THROTTLE_MS) lastCatchUp.delete(key);
    }
  }

  try {
    await notificationService.dispatchDueNotifications({ userId });
  } catch (error) {
    console.error('[NOTIFY] catch-up dispatch failed:', error);
  }
}
