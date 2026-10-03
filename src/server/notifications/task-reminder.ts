import { NotificationStatus, NotificationType } from '@/generated/prisma';
import { TaskRepository } from '@/server/repositories/task.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { toUserId, type UserId } from '@/types/ids';

/**
 * Task reminder producer.
 *
 * ERROR.md A5: "Users are not getting notifications for their task reminders
 * even though the system says it will notify them."
 *
 * `NotificationType.TASK_DUE` and `TASK_OVERDUE` existed in the schema and
 * nothing in the codebase ever created one — the only references were the
 * generated Prisma enum. So even with Web Push fully working, a task with a
 * `dueDate` would never notify anyone. This module is that missing producer.
 *
 * It is deliberately idempotent: a reminder is keyed on the task id and the
 * reminder kind, so re-running it (every cron tick is every 5 minutes) cannot
 * produce duplicate notifications for the same task.
 */

/** How long before the due time the "due soon" reminder fires. */
const DUE_SOON_MINUTES = 60;

/** How long past the due time a task stays "overdue" and worth nagging about. */
const OVERDUE_WINDOW_HOURS = 24;

export interface TaskReminderResult {
  created: number;
  /** Tasks skipped because the user has reminders turned off. */
  skippedBySettings: number;
  considered: number;
}

export class TaskReminderService {
  private taskRepository: TaskRepository;
  private userRepository: UserRepository;

  constructor() {
    this.taskRepository = new TaskRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Create due-soon / overdue notifications for every open task that needs one.
   *
   * @param now Injectable for testing; defaults to the current time.
   */
  async scheduleTaskReminders(now: Date = new Date()): Promise<TaskReminderResult> {
    const result: TaskReminderResult = {
      created: 0,
      skippedBySettings: 0,
      considered: 0,
    };

    // A single window covering both cases: anything due within the next hour,
    // plus anything already overdue but still inside the nag window.
    const windowStart = new Date(now.getTime() - OVERDUE_WINDOW_HOURS * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + DUE_SOON_MINUTES * 60 * 1000);

    const candidates = await this.taskRepository.findByDueWindow(
      windowStart,
      windowEnd
    );

    for (const task of candidates) {
      result.considered += 1;

      const settings = await this.userRepository.getSettings(toUserId(task.userId));
      // `habitReminders` is the user's general "reminders" toggle; task
      // reminders have no dedicated column in the schema, so the habit flag is
      // the closest existing switch and is what the settings UI exposes.
      if (!settings || settings.notificationsEnabled !== true || settings.habitReminders !== true) {
        result.skippedBySettings += 1;
        continue;
      }

      const due = task.dueDate ?? task.scheduledFor;
      if (!due) continue;

      const overdue = due.getTime() < now.getTime();
      const type = overdue ? NotificationType.TASK_OVERDUE : NotificationType.TASK_DUE;

      // Idempotency: one reminder per (task, kind). The notification row stores
      // `relatedEntityId`, so checking for an existing one is a single indexed
      // lookup and this stays cheap at 12 cron ticks an hour.
      const already = await this.hasReminder(toUserId(task.userId), type, task.id);
      if (already) continue;

      const when = new Date(now);
      const timeLabel = due.toISOString().slice(11, 16);

      await this.createReminder({
        userId: task.userId,
        type,
        relatedEntityId: task.id,
        title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
        body: overdue
          ? `This task was due at ${timeLabel} UTC and is still open.`
          : `This task is due at ${timeLabel}.`,
        actionUrl: '/goals',
        actionData: { taskId: task.id },
        scheduledFor: when,
        status: NotificationStatus.PENDING,
      });

      result.created += 1;
    }

    return result;
  }

  /**
   * Create the row via the notification service when available.
   *
   * Imported lazily inside the method to avoid a module cycle: the notification
   * service pulls in this module's siblings and several repositories, and
   * `tsc` does not detect cycles while `next build` fails at runtime with
   * "Cannot access before initialization". See ERROR.md §5.1.
   */
  private async createReminder(input: {
    userId: string;
    type: NotificationType;
    relatedEntityId: string;
    title: string;
    body: string;
    actionUrl: string;
    actionData: Record<string, string>;
    scheduledFor: Date;
    status: NotificationStatus;
  }): Promise<void> {
    const { NotificationService } = await import(
      '@/server/services/notification.service'
    );
    await new NotificationService().createNotification(toUserId(input.userId), input);
  }

  private async hasReminder(
    userId: UserId,
    type: NotificationType,
    relatedEntityId: string
  ): Promise<boolean> {
    const { NotificationRepository } = await import(
      '@/server/repositories/notification.repository'
    );
    const count = await new NotificationRepository().countByTypeAndRelatedId(
      userId,
      type,
      relatedEntityId
    );
    return count > 0;
  }

  /**
   * The user's "today", so a reminder scheduled near midnight is judged against
   * their own calendar day rather than UTC.
   */
  async todayFor(userId: UserId): Promise<string> {
    const timezone =
      (await this.userRepository.getSettings(userId).catch(() => null))?.timezone ??
      DEFAULT_TZ;
    return getTodayString(timezone);
  }
}

export const taskReminderService = new TaskReminderService();
