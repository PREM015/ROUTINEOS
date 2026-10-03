import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { toUserId, userIdFromSession, type UserId } from '@/types/ids';

/**
 * Notification History Route (ERROR.md L)
 *
 * GET  /api/notifications – the filtered history behind the navbar bell
 * POST /api/notifications – `markAllRead`
 *
 * The period/category/tag filtering, the timezone window and the facet counts all
 * live in `NotificationService.getHistory`. They are domain rules — in
 * particular, "Today" means the *user's* today — and they were previously
 * unreachable from anywhere except this handler.
 */

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
 * case is one extra idempotent dispatch, which is harmless because `markSent` is
 * guarded on `status = PENDING`.
 */
const lastCatchUp = new Map<string, number>();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z
    .enum([
      'routine', 'habits', 'goals', 'tasks', 'sleep', 'focus',
      'streaks', 'reviews', 'achievements', 'insights', 'journal',
      'settings', 'system',
    ])
    .optional(),
  /**
   * Filter by a specific tag. Accepts either a fixed tag ("Routine", "Habit",
   * "Achievement", ...) or one of the user's own block labels ("DSA",
   * "Personal", ...), matched case-insensitively.
   */
  tag: z.string().min(1).max(60).optional(),
  period: z.enum(['all', 'day', 'week', 'month', 'year']).default('all'),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * GET /api/notifications
 *
 * Supports the filters ERROR.md L asks for:
 *   ?category=routine|habits|goals|tasks|sleep|focus|streaks|reviews|achievements|insights|system
 *   ?period=all|day|week|month|year
 *   ?unreadOnly=true
 *   ?limit=&offset=
 *
 * Also runs a throttled catch-up dispatch, which is the self-healing layer for
 * the free scheduler: anything the GitHub Actions ticker missed is still
 * deliverable, because the dispatcher selects everything `scheduledFor <= now`.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = await notificationService.getHistory(toUserId(userId), parsed.data);

    void runCatchUp(toUserId(userId));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

const markAllSchema = z.object({
  action: z.literal('markAllRead'),
});

/**
 * POST /api/notifications
 * `markAllRead` in one query.
 *
 * The bell previously implemented "mark all read" by issuing one PATCH per
 * loaded row. With 70 notifications and a 20-row page that marked 20 and left
 * the rest, so the unread badge reappeared on the next poll and the button
 * looked broken. `NotificationService.markAllRead` does it in a single statement.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = markAllSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Unsupported action' },
        { status: 400 }
      );
    }
    const updated = await notificationService.markAllRead(userIdFromSession(session));
    return NextResponse.json({ success: true, data: { updated } });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}

/**
 * Dispatch anything overdue for this user, at most once per throttle window.
 *
 * Never rejects: a catch-up failure is logged and the next attempt retries.
 */
async function runCatchUp(userId: UserId): Promise<void> {
  const now = Date.now();
  const previous = lastCatchUp.get(userId);
  if (previous !== undefined && now - previous < CATCH_UP_THROTTLE_MS) return;

  lastCatchUp.set(userId, now);

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
