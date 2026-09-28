import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RoutineService } from '@/server/services/routine.service';
import { NotificationRepository } from '@/server/repositories/notification.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';

const bodySchema = z.object({
  notificationId: z.string().min(1),
  action: z.enum(['DONE', 'SNOOZE', 'SKIP']),
});

/** How long "Snooze" postpones a routine reminder. */
const SNOOZE_MINUTES = 10;

/**
 * POST /api/notifications/action
 *
 * Handles the action buttons rendered on a push notification.
 *
 * ## Why this exists
 *
 * The service worker previously only forwarded two hardcoded sleep actions. A
 * routine reminder was a dead-end toast: the only response available was to open
 * the app and find the block yourself. These buttons let a reminder be
 * acknowledged from the notification itself, which is the point of a reminder.
 *
 * ## Actions
 *
 *   DONE    Mark the routine block completed for today.
 *   SNOOZE  Push the reminder 10 minutes out — for "I'm mid-task, not now, but
 *           don't lose it".
 *   SKIP    Mark the block skipped for today.
 *
 * ## Safety
 *
 * The target is the authenticated session, and the notification row is fetched
 * scoped to that user, so a guessed or stale `notificationId` cannot reach
 * another account. `logBlockCompletion` independently re-verifies that the
 * routine block belongs to the user before writing anything.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid action request' },
        { status: 400 }
      );
    }
    const { notificationId, action } = parsed.data;

    const notifications = new NotificationRepository();
    const notification = await notifications.findById(userId, notificationId);
    if (!notification) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }

    // `relatedEntityId` is the routine block id for ROUTINE_START rows.
    const blockId = notification.relatedEntityId;
    if (!blockId) {
      return NextResponse.json(
        { success: false, error: 'This notification has nothing to act on' },
        { status: 400 }
      );
    }

    if (action === 'SNOOZE') {
      const snoozedTo = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
      // Scoped to the caller and to PENDING, so this cannot postpone another
      // account's row or a reminder that has already been dealt with.
      const updated = await notifications.snooze(userId, notificationId, snoozedTo);
      if (updated === 0) {
        return NextResponse.json(
          { success: false, error: 'This notification can no longer be snoozed' },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        data: { action, snoozedMinutes: SNOOZE_MINUTES, scheduledFor: snoozedTo },
      });
    }

    // The user's own calendar day, so an evening tap is not logged against UTC.
    const timezone =
      (await new UserRepository().getSettings(userId).catch(() => null))?.timezone ??
      DEFAULT_TZ;
    const date = getTodayString(timezone);

    const routineService = new RoutineService();
    // Throws if the block is not the user's, which is the ownership check.
    await routineService.logBlockCompletion(
      userId,
      blockId,
      date,
      action === 'DONE' ? 'COMPLETED' : 'SKIPPED'
    );

    // Retire it so the same reminder cannot fire again today.
    await notifications.markSent(userId, notificationId, { push: true });

    return NextResponse.json({ success: true, data: { action, date, blockId } });
  } catch (error) {
    console.error('[NOTIFY] action failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply notification action' },
      { status: 500 }
    );
  }
}
