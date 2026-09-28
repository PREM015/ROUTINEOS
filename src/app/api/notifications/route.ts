import { auth } from '@/lib/auth';
import { notificationService } from '@/server/services/notification.service';
import { NotificationRepository } from '@/server/repositories/notification.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CATEGORY_ORDER,
  PERIOD_DAYS,
  categoryFor,
  type NotificationCategory,
} from '@/lib/notifications/categories';
import { getTodayString, shiftCalendarDay, DEFAULT_TZ } from '@/lib/dates';

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

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.enum([
    'routine', 'habits', 'goals', 'tasks', 'sleep', 'focus',
    'streaks', 'reviews', 'achievements', 'insights', 'system',
  ]).optional(),
  period: z.enum(['all', 'day', 'week', 'month', 'year']).default('all'),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * GET /api/notifications
 *
 * The notification history behind the navbar bell (ERROR.md L).
 *
 * Supports the filters that spec asks for:
 *   ?category=routine|habits|goals|tasks|sleep|focus|streaks|reviews|achievements|insights|system
 *   ?period=all|day|week|month|year
 *   ?unreadOnly=true
 *   ?limit=&offset=            (paging)
 *
 * `period` is evaluated against the **user's** timezone, so "Today" means their
 * today rather than UTC's.
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
    const { limit, offset, category, period, unreadOnly } = parsed.data;

    const repository = new NotificationRepository();
    const timezone =
      (await new UserRepository().getSettings(userId).catch(() => null))?.timezone ??
      DEFAULT_TZ;

    /**
     * Fetch, then filter in memory.
     *
     * The window is deliberately computed from the user's own calendar day. The
     * alternative — comparing `scheduledFor` against a UTC day boundary — showed
     * an evening reminder as "yesterday" for anyone east of UTC.
     */
    const windowDays = period === 'all' ? null : PERIOD_DAYS[period];
    const scanLimit = windowDays === null ? limit + offset : 400;
    const candidates = await repository.findAll(userId, {
      limit: scanLimit,
      offset: 0,
      unreadOnly,
    });

    const todayLocal = getTodayString(timezone);
    const cutoffLocal =
      windowDays === null ? null : shiftCalendarDay(todayLocal, -(windowDays - 1));

    const filtered = candidates.filter((n) => {
      if (category && categoryFor(n.type) !== category) return false;
      if (cutoffLocal !== null) {
        // Compare calendar days in the user's zone, not raw instants.
        const local = localDateOf(n.scheduledFor, timezone);
        if (local < cutoffLocal) return false;
      }
      return true;
    });

    const page = filtered.slice(offset, offset + limit);

    // Per-category totals for the filter chips, computed over the same window so
    // the counts agree with what the list shows.
    const counts = {} as Record<NotificationCategory, number>;
    for (const c of CATEGORY_ORDER) counts[c] = 0;
    for (const n of filtered) counts[categoryFor(n.type)] += 1;

    void runCatchUp(userId);

    return NextResponse.json({
      success: true,
      data: {
        notifications: page.map((n) => ({
          id: n.id,
          type: n.type,
          category: categoryFor(n.type),
          title: n.title,
          body: n.body,
          actionUrl: n.actionUrl,
          scheduledFor: n.scheduledFor,
          sentAt: n.sentAt,
          readAt: n.readAt,
          status: n.status,
          errorMessage: n.errorMessage,
        })),
        unreadCount: await notificationService.getUnreadCount(userId),
        total: filtered.length,
        hasMore: filtered.length > offset + limit,
        counts,
        timezone,
      },
    });
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
 * looked broken. `NotificationRepository.markAllRead` does it in a single
 * statement.
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
    const updated = await new NotificationRepository().markAllRead(session.user.id);
    return NextResponse.json({ success: true, data: { updated } });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    );
  }
}

/** The `YYYY-MM-DD` an instant falls on in the user's zone. */
function localDateOf(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return getTodayString(DEFAULT_TZ);
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
