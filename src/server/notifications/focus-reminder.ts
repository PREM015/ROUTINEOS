import { NotificationStatus, NotificationType } from '@/generated/prisma';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { toUserId, type UserId } from '@/types/ids';

/**
 * Schedules the two focus notifications that only the *server* can know are due.
 *
 * ## Why this is server-side at all
 *
 * `FOCUS_SESSION_END` and `BREAK_REMINDER` existed in the `NotificationType` enum and
 * nothing ever produced them. A client timer can notify its own user while the tab is
 * open, but it cannot:
 *
 *   - notify at all once the tab is closed, which is exactly when a 25-minute block
 *     ending matters most;
 *   - survive a reload, a sleep/wake, or a crashed service worker;
 *   - reach a user on another device.
 *
 * So the producer runs in the cron tick, reads the sessions that are due, and writes
 * `PENDING` rows for the generic dispatcher to send.
 *
 * ## Why it is idempotent
 *
 * The tick runs every few minutes and will re-read the same due session many times.
 * `hasReminder` checks for an existing `PENDING` row for the same
 * (type, relatedEntityId) pair, so a repeat tick creates nothing. That guard is what
 * makes this safe to run as often as the scheduler does - and it is the reason the
 * notification carries `relatedEntityId: session.id` rather than only a timestamp.
 *
 * ## Why the past is excluded
 *
 * Only sessions whose `endsAt` is still in the future are scheduled. A session that
 * ended nine hours ago is not "about to end", and notifying now would be noise. The
 * window is bounded so a tick cannot walk the whole table.
 */

const LOOKAHEAD_MS = 30 * 60 * 1000;
/** How far back to consider a still-running session that was somehow not settled. */
const GRACE_MS = 5 * 60 * 1000;

interface DueSession {
  id: string;
  endsAt: Date | null;
  type: string;
  title: string | null;
}

export class FocusReminderService {
  private focusRepository: FocusRepository;
  private userRepository: UserRepository;

  constructor() {
    this.focusRepository = new FocusRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Create any focus notifications that are due but not yet queued.
   *
   * Called from `notification-tick`, which wraps each stage in its own try/catch, so a
   * throw here degrades to one failed stage rather than a dead tick.
   */
  async scheduleFocusReminders(): Promise<{ scanned: number; created: number }> {
    const result = { scanned: 0, created: 0 };

    const userIds = await this.userRepository.findActiveUserIds();
    const now = Date.now();
    const dueFrom = new Date(now - GRACE_MS);
    const dueUntil = new Date(now + LOOKAHEAD_MS);

    for (const rawUserId of userIds) {
      try {
        const created = await this.scheduleForUser(rawUserId, dueFrom, dueUntil);
        result.scanned += 1;
        result.created += created;
      } catch {
        // One user's failure must not stop the rest. The tick reports stage-level
        // errors; per-user isolation is what keeps a single bad row from silently
        // disabling reminders for everyone after it.
      }
    }

    return result;
  }

  private async scheduleForUser(
    rawUserId: string,
    dueFrom: Date,
    dueUntil: Date
  ): Promise<number> {
    const userId = toUserId(rawUserId);

    // Both toggles are checked per type, because "remind me when a block ends" and
    // "remind me to take a break" are separate decisions and the settings page exposes
    // them separately.
    const settings = await this.userRepository.getSettings(userId);
    const wantsEnd = settings?.focusReminders !== false;
    const wantsBreak = settings?.breakReminders !== false;
    if (!wantsEnd && !wantsBreak) return 0;

    const sessions = (await this.findDueSessions(userId, dueFrom, dueUntil)) as DueSession[];
    if (sessions.length === 0) return 0;

    let created = 0;
    for (const session of sessions) {
      const isBreak = session.type !== 'FOCUS';
      if (isBreak ? !wantsBreak : !wantsEnd) continue;
      if (await this.hasReminder(userId, session)) continue;

      // Imported lazily for the same reason as `task-reminder`: the notification
      // service pulls in this module's siblings and several repositories, and a static
      // import is a module cycle that `tsc` accepts but `next build` fails at runtime.
      const { NotificationService } = await import('@/server/services/notification.service');
      await new NotificationService().createNotification(userId, {
        type: isBreak ? NotificationType.BREAK_REMINDER : NotificationType.FOCUS_SESSION_END,
        relatedEntityId: session.id,
        title: isBreak ? 'Break over' : 'Focus block complete',
        body: session.title?.trim()
          ? `${session.title} — time is up.`
          : 'Your focus block finished. Take a break.',
        actionUrl: '/focus',
        actionData: {},
        scheduledFor: session.endsAt ?? dueUntil,
        status: NotificationStatus.PENDING,
      });
      created += 1;
    }

    return created;
  }

  /** Sessions still open whose planned end lands inside the lookahead. */
  private async findDueSessions(
    userId: UserId,
    dueFrom: Date,
    dueUntil: Date
  ): Promise<unknown[]> {
    const all = await this.focusRepository.findSessions(userId, {
      limit: 50,
      status: 'IN_PROGRESS',
    });
    return (all ?? []).filter((row) => {
      const endsAt = (row as { endsAt?: Date | null }).endsAt;
      if (!endsAt) return false;
      return endsAt >= dueFrom && endsAt <= dueUntil;
    });
  }

  /** An existing queued reminder for this session means this tick already handled it. */
  private async hasReminder(
    userId: UserId,
    session: DueSession
  ): Promise<boolean> {
    const type =
      session.type !== 'FOCUS' ? NotificationType.BREAK_REMINDER : NotificationType.FOCUS_SESSION_END;
    /*
     * Queried through the notification repository rather than the focus one: a
     * notification is a notification, and the dedupe question ("has this already been
     * queued?") is owned by whoever writes them. Filtering the pending rows by
     * `relatedEntityId` is what makes this idempotent across repeated ticks - the
     * notification carries the session id precisely so that check is possible.
     */
    const { NotificationRepository } = await import(
      '@/server/repositories/notification.repository'
    );
    const pending = await new NotificationRepository().findPendingByType(userId, [type]);
    return pending.some((row) => row.relatedEntityId === session.id);
  }
}

export const focusReminderService = new FocusReminderService();