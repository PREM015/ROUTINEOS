import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { notificationService } from '@/server/services/notification.service';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/app-error';
import { toUserId } from '@/types/ids';

const bodySchema = z.object({
  notificationId: z.string().min(1),
  action: z.enum([
    'DONE', 
    'SNOOZE', 
    'SKIP',
    'STARTED_ON_TIME',
    'STARTED_LATE',
    'STARTED_EARLY',
    'BUSY_WITH_OTHER',
    'SKIP_BLOCK',
    'FINISHED_ON_TIME',
    'FINISHED_LATE',
    'FINISHED_EARLY',
    'NOT_COMPLETED'
  ]),
  actualStartTime: z.string().optional(),
  actualEndTime: z.string().optional(),
  replacementActivity: z.string().optional(),
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
 * The action handling — including the `RoutineService` call and its deliberate
 * lazy import — is in `NotificationService.applyAction`, so the same behaviour is
 * available to any other surface that wants to acknowledge a reminder.
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

    const data = await notificationService.applyAction(
      toUserId(userId),
      parsed.data.notificationId,
      parsed.data.action,
      {
        snoozeMinutes: SNOOZE_MINUTES,
        actualStartTime: parsed.data.actualStartTime,
        actualEndTime: parsed.data.actualEndTime,
        replacementActivity: parsed.data.replacementActivity,
      }
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[NOTIFY] action failed:', error);

    // The row is fetched scoped to the caller, so a guessed or stale
    // `notificationId` cannot reach another account.
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to apply notification action' },
      { status: 500 }
    );
  }
}
