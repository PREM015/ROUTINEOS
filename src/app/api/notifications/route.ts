import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { handleError } from '@/lib/errors/error-handler';
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

    const sweepPromise = runSweep(toUserId(userId));
    const data = await notificationService.getHistory(toUserId(userId), parsed.data);
    // The sweep is a single indexed `updateMany`; awaiting it before the read
    // is what stops the first page load reporting an unread count that its own
    // sweep is about to invalidate.
    await sweepPromise;

    void runCatchUp(toUserId(userId));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

const markAllSchema = z.object({
  action: z.enum(['markAllRead', 'dismissAll']),
});

/**
 * POST /api/notifications
 * `markAllRead` in one query, or `dismissAll` in one query.
 *
 * The bell previously implemented "mark all read" by issuing one PATCH per
 * loaded row. With 70 notifications and a 20-row page that marked 20 and left
 * the rest, so the unread badge reappeared on the next poll and the button
 * looked broken. `NotificationService.markAllRead` does it in a single statement.
 *
 * `dismissAll` is the bulk counterpart the history page never had: it takes
 * rows out of the feed entirely rather than marking them seen, which is what a
 * user clearing a 140-row backlog actually wants.
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
    const userId = userIdFromSession(session);
    const data =
      parsed.data.action === 'markAllRead'
        ? await notificationService.markAllRead(userId)
        : await notificationService.dismissAll(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Minimum gap between stale-sweep attempts, per user.
 *
 * Separate from the catch-up throttle because this one has to run *before* the
 * history read: a row that is already past `STALE_NOTIFICATION_DAYS` must not be
 * counted as unread on the very request that would have swept it.
 */
const SWEEP_THROTTLE_MS = 5 * 60 * 1000;
const lastSweep = new Map<string, number>();

/**
 * Mark the user's stale delivered rows as read, at most once per throttle window.
 *
 * Never rejects: a failed sweep leaves the badge a little high, which is far
 * better than failing the page load that asked for the list.
 */
async function runSweep(userId: UserId): Promise<void> {
  const now = Date.now();
  const previous = lastSweep.get(userId);
  if (previous !== undefined && now - previous < SWEEP_THROTTLE_MS) return;

  lastSweep.set(userId, now);
  if (lastSweep.size > 5_000) {
    for (const [key, at] of lastSweep) {
      if (now - at > SWEEP_THROTTLE_MS) lastSweep.delete(key);
    }
  }

  try {
    await notificationService.sweepStaleNotifications(userId);
  } catch (error) {
    console.error('[NOTIFY] stale sweep failed:', error);
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
    // The stale sweep runs on its own, before the history read (see `runSweep`);
    // only the dispatch is left here.
    await notificationService.dispatchDueNotifications({ userId });
  } catch (error) {
    console.error('[NOTIFY] catch-up dispatch failed:', error);
  }
}
