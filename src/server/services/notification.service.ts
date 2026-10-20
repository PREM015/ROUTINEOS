import { NotificationType, NotificationStatus, type NotificationLog } from '@/generated/prisma';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import {
  NotificationRepository,
  type DeliveryChannels,
} from '@/server/repositories/notification.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { ACHIEVEMENTS_PATH, achievementDeepLink } from '@/lib/achievements/links';
import { DEFAULT_TZ } from '@/lib/dates';
import {
  CATEGORY_ORDER,
  PERIOD_DAYS,
  categoryFor,
  normaliseTag,
  tagsFor,
  type NotificationCategory,
  type PeriodFilter,
} from '@/lib/notifications/categories';
import { pushService } from '@/server/services/push.service';
import { toUserIdOptional, toUserId, type UserId  } from '@/types/ids';

/**
 * Notification Service
 * Business logic for user notifications (in-app, reminders, achievements)
 */

/**
 * `SLEEP_PROMPT` is delivered inline by `SleepSessionService`, which fires on
 * the user's own bedtime/wake window rather than on `scheduledFor`. Excluding it
 * here keeps a single owner per row and prevents double-sending.
 */
const DISPATCH_EXCLUDED_TYPES: NotificationType[] = [NotificationType.SLEEP_PROMPT];

/** Per-run cap, so one invocation cannot exhaust the cron's 60s budget. */
const DISPATCH_BATCH_SIZE = 100;

/** Give up on a row after this many failed attempts. */
const DISPATCH_MAX_RETRIES = 3;

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  byChannel: DeliveryChannels;
}

/**
 * The `UserSettings` columns that decide whether a given notification type may
 * be delivered at all.
 *
 * These switches are exposed on Settings > Notifications. Before this map
 * existed they were persisted but never read: the page saved them, showed a
 * green "Saved" badge, and the dispatcher ignored them, so opting out of habit
 * reminders had no effect on delivery. Gating here — the single choke point
 * every queued row passes through — makes them authoritative.
 *
 * A notification with no entry is always delivered (subject to the master
 * `notificationsEnabled` switch), so new types are not silently dropped.
 */
const CATEGORY_GATES: Partial<Record<NotificationType, keyof CategorySettings>> = {
  [NotificationType.HABIT_REMINDER]: 'habitReminders',
  [NotificationType.GOAL_DEADLINE]: 'goalReminders',
  [NotificationType.ROUTINE_START]: 'routineStartNotifications',
  [NotificationType.SLEEP_TRACKING_STARTED]: 'sleepReminderNotifications',
};

/** The settings columns referenced by {@link CATEGORY_GATES}. */
type CategorySettings = {
  habitReminders: boolean | null;
  goalReminders: boolean | null;
  routineStartNotifications: boolean | null;
  sleepReminderNotifications: boolean | null;
};

const createNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1, 'Title is required').max(160),
  body: z.string().max(2000).optional(),
  relatedEntityId: z.string().optional(),
  actionUrl: z.string().max(500).optional(),
  actionData: z.record(z.string(), z.unknown()).optional(),
  scheduledFor: z.date().optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
});

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  actionData?: Record<string, unknown>;
  scheduledFor?: Date;
  status?: NotificationStatus;
}

/**
 * Split the `actionData` JSON column into the parts the push payload needs.
 *
 * `actions` is lifted out because it is a structured field, not free-form data.
 * The remainder is forwarded to the service worker untouched. Malformed JSON is
 * tolerated: a malformed column must not stop the notification being delivered.
 */
function parseActionData(raw: string | null | undefined): {
  actions: Array<{ action: string; title: string }>;
  rest: Record<string, unknown>;
  promptId?: string;
} {
  if (!raw) return { actions: [], rest: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { actions: [], rest: {} };
  }
  if (typeof parsed !== 'object' || parsed === null) return { actions: [], rest: {} };

  const record = parsed as Record<string, unknown>;
  const rawActions = Array.isArray(record.actions) ? record.actions : [];
  const actions = rawActions
    .filter(
      (a): a is { action: string; title: string } =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as { action?: unknown }).action === 'string' &&
        typeof (a as { title?: unknown }).title === 'string'
    )
    .slice(0, 2);

  const { actions: _omitted, ...rest } = record;
  return {
    actions,
    rest,
    promptId: typeof record.promptId === 'string' ? record.promptId : undefined,
  };
}

// ===========================================================================
// History feed
// ===========================================================================

/**
 * How many rows of a period window may be read at once.
 *
 * The page is 25 rows and the feed is a personal history, so this is three
 * orders of magnitude more than the UI can show. It is a backstop rather than a
 * target: past the cap the view degrades to "the most recent `cap` in this
 * period" instead of pulling an unbounded result into one request.
 */
const HISTORY_WINDOW_CAP = 2_000;

/** One row of the history feed, as the page renders it. */
export interface HistoryRow {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string | null;
  actionUrl: string | null;
  scheduledFor: Date;
  sentAt: Date | null;
  readAt: Date | null;
  status: NotificationStatus;
  errorMessage: string | null;
  /** The category tag, the user's own block label, then the entity. */
  tags: string[];
  /** The user's own label, so the page can highlight it apart from the rest. */
  userCategory: string | null;
}

/** The full payload of `GET /api/notifications`. */
export interface NotificationHistoryResult {
  notifications: HistoryRow[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
  /** Every category in {@link CATEGORY_ORDER}, zeroed, then counted. */
  counts: Record<NotificationCategory, number>;
  /** Every tag in the window, lowercased, with counts. */
  tagCounts: Record<string, number>;
  timezone: string;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function emptyCounts(): Record<NotificationCategory, number> {
  const counts = {} as Record<NotificationCategory, number>;
  for (const category of CATEGORY_ORDER) counts[category] = 0;
  return counts;
}

/**
 * The user's own label for a routine block.
 *
 * `RoutineBlock.categoryId -> Category.name` is captured into the notification's
 * `actionData.category` at schedule time, so this is a JSON read rather than a
 * join. A row whose column is absent, malformed or not a non-empty string has
 * no label - it must never throw, because one odd payload would take the whole
 * history feed down with it.
 */
function userCategoryOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as Record<string, unknown>).category;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The first instant of the period window, in the user's timezone, or `null` for
 * the whole history.
 *
 * "Day" is the user's *current* calendar day, not the last 24 hours, and the
 * longer periods step back whole calendar days from that same midnight. Without
 * this, someone in Asia/Kolkata asking for "Day" at 03:00 IST would see
 * yesterday's notifications.
 */
function historyWindowStart(period: PeriodFilter, timezone: string): Date | null {
  if (period === 'all') return null;
  const today = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
  const start = fromZonedTime(`${today}T00:00:00`, timezone);
  start.setUTCDate(start.getUTCDate() - (PERIOD_DAYS[period] - 1));
  return start;
}

export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Create a notification for a user
   */
  async createNotification(
    userId: UserId,
    input: CreateNotificationInput,
  ): Promise<NotificationLog> {
    const parsed = createNotificationSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.errors[0]?.message ?? 'Invalid notification data');
    }

    return this.notificationRepository.create(userId, {
      type: parsed.data.type,
      relatedEntityId: parsed.data.relatedEntityId,
      title: parsed.data.title,
      body: parsed.data.body,
      actionUrl: parsed.data.actionUrl,
      actionData: parsed.data.actionData ? JSON.stringify(parsed.data.actionData) : undefined,
      scheduledFor: parsed.data.scheduledFor ?? new Date(),
      status: parsed.data.status,
      sentAt: parsed.data.status === NotificationStatus.SENT ? new Date() : undefined,
    });
  }

  /**
   * List notifications for a user
   */
  async getNotifications(
    userId: UserId,
    query: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<NotificationLog[]> {
    return this.notificationRepository.findAll(userId, {
      unreadOnly: query.unreadOnly,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  /**
   * The timezone the history window is computed in.
   *
   * `UserSettings.timezone` is what Settings edits, and `UserService.updateSettings`
   * mirrors it onto `User.timezone` in the same statement, so either is
   * authoritative in practice. Both are read here because a missing settings row
   * must not silently move a user's "Day" window back to UTC.
   */
  private async resolveTimezone(userId: UserId): Promise<string> {
    const [settings, user] = await Promise.all([
      this.userRepository.getSettings(userId),
      this.userRepository.findById(userId),
    ]);
    return settings?.timezone || user?.timezone || DEFAULT_TZ;
  }

  /**
   * The notification history feed behind `GET /api/notifications`.
   *
   * The route's contract is a single object: a page of rows **plus** the facet
   * data the `/notifications` page renders beside them - `counts` per category,
   * `tagCounts` per tag, `unreadCount`, `total`, `hasMore` and the timezone the
   * window was computed in. Every one of those is derived from the same window,
   * so the chips above the list can never claim a count the list does not
   * honour.
   *
   * ## Why this is not one query per filter
   *
   * `NotificationLog` has no `category` column and no tag relation; its `type`
   * is a different taxonomy (`ROUTINE_REMINDER`, `HABIT_REMINDER`, ...) from the
   * page's vocabulary (`routine`, `habits`, ...). The mapping is not missing
   * though - `categoryFor` / `tagsFor` in `lib/notifications/categories` are
   * exhaustive and are the very functions the page uses to render a row. Both
   * depend on per-row values (`type`, `relatedEntityId`, and the user's own
   * block label inside the `actionData` JSON), so the window is read once,
   * enriched in memory, and then filtered, counted and paged.
   *
   * That is a fixed three or four queries however many filters are active, and
   * it is what makes the category chips, the tag chips, the total and the list
   * agree with each other by construction.
   *
   * The period window is applied to `scheduledFor` **in the user's timezone**,
   * so "Day" means their today rather than UTC's.
   */
  async getHistory(
    userId: UserId,
    query: {
      limit?: number;
      offset?: number;
      /** One of {@link CATEGORY_ORDER}; the route validates it before we see it. */
      category?: NotificationCategory;
      tag?: string;
      period?: PeriodFilter;
    } = {},
  ): Promise<NotificationHistoryResult> {
    const limit = clampInt(query.limit ?? 20, 1, 100);
    const offset = clampInt(query.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const period = query.period ?? 'all';
    const category = query.category;
    const tag = query.tag?.trim() || undefined;

    const timezone = await this.resolveTimezone(userId);
    const window = await this.notificationRepository.findHistoryWindow(
      userId,
      historyWindowStart(period, timezone),
      HISTORY_WINDOW_CAP,
    );

    // One pass to enrich, one to filter and count. Kept as two loops rather than
    // one so the facet semantics stay readable: a category chip counts rows the
    // *tag* filter would leave, and a tag chip counts rows the *category* filter
    // would leave, which is what makes the two filters composable.
    const enriched: HistoryRow[] = window.map((row) => {
      const userCategory = userCategoryOf(row.actionData);
      return {
        id: row.id,
        type: row.type,
        category: categoryFor(row.type),
        title: row.title,
        body: row.body,
        actionUrl: row.actionUrl,
        scheduledFor: row.scheduledFor,
        sentAt: row.sentAt,
        readAt: row.readAt,
        status: row.status,
        errorMessage: row.errorMessage,
        tags: tagsFor(row.type, row.relatedEntityId, userCategory).all,
        userCategory,
      };
    });

    const counts = emptyCounts();
    const tagCounts: Record<string, number> = {};
    const selected: HistoryRow[] = [];
    const activeTag = tag ? normaliseTag(tag) : null;

    for (const row of enriched) {
      const matchesCategory = category === undefined || row.category === category;
      const matchesTag =
        activeTag === null || row.tags.some((t) => normaliseTag(t) === activeTag);

      if (matchesTag) counts[row.category] = (counts[row.category] ?? 0) + 1;
      if (matchesCategory) {
        for (const t of row.tags) {
          const key = normaliseTag(t);
          tagCounts[key] = (tagCounts[key] ?? 0) + 1;
        }
      }
      if (matchesCategory && matchesTag) selected.push(row);
    }

    const page = selected.slice(offset, offset + limit);

    return {
      notifications: page,
      // Mirrors how the page decides what is unread (`!readAt`), so the badge in
      // the header can never disagree with the dots in the list below it.
      unreadCount: selected.reduce((n, row) => (row.readAt ? n : n + 1), 0),
      total: selected.length,
      hasMore: offset + limit < selected.length,
      counts,
      tagCounts,
      timezone,
    };
  }

  /**
   * Apply an action tapped on a notification.
   *
   * The push action buttons render on the notification itself, where there is no
   * session to authorize against, so this is reached from an authenticated
   * request that already carries `userId`; every branch below scopes by that id
   * rather than trusting the id in the body.
   *
   * `DONE` and `SKIP` both close the notification out but mean different things
   * to the history feed - read versus dismissed - so they are not collapsed.
   *
   * Routine check-in actions:
   * - `STARTED_ON_TIME` / `STARTED_LATE` / `STARTED_EARLY` - start check-in responses
   * - `BUSY_WITH_OTHER` - user is doing something else instead
   * - `SKIP_BLOCK` - user doesn't want to do the task
   * - `FINISHED_ON_TIME` / `FINISHED_LATE` / `FINISHED_EARLY` - completion check-in responses
   * - `NOT_COMPLETED` - user explicitly says they didn't complete
   */
  async applyAction(
    userId: UserId,
    notificationId: string,
    action: 'DONE' | 'SNOOZE' | 'SKIP' | 'STARTED_ON_TIME' | 'STARTED_LATE' | 'STARTED_EARLY' | 'BUSY_WITH_OTHER' | 'SKIP_BLOCK' | 'FINISHED_ON_TIME' | 'FINISHED_LATE' | 'FINISHED_EARLY' | 'NOT_COMPLETED',
    options?: { 
      snoozeMinutes?: number; 
      actualStartTime?: string; 
      actualEndTime?: string;
      replacementActivity?: string;
    }
  ): Promise<NotificationLog | { snoozed: boolean; scheduledFor: Date }> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }

    // Handle routine check-in actions
    const isStartCheckIn = action.startsWith('STARTED_');
    const isCompletionCheckIn = action.startsWith('FINISHED_') || action === 'NOT_COMPLETED';
    const isBusyWithOther = action === 'BUSY_WITH_OTHER';
    const isSkipBlock = action === 'SKIP_BLOCK';

    if (isStartCheckIn || isCompletionCheckIn || isBusyWithOther || isSkipBlock) {
      return this.handleRoutineCheckIn(userId, existing, action, options);
    }

    if (action === 'DONE') {
      return this.notificationRepository.markRead(userId, notificationId);
    }

    if (action === 'SKIP') {
      const dismissed = await this.notificationRepository.markDismissed(userId, notificationId);
      if (dismissed === 0) {
        throw new Error('Notification could not be dismissed');
      }
      return this.notificationRepository.findById(userId, notificationId).then((row) => {
        if (!row) throw new Error('Notification not found');
        return row;
      });
    }

    const scheduledFor = new Date(Date.now() + (options?.snoozeMinutes ?? 10) * 60 * 1000);
    const snoozed = await this.notificationRepository.snooze(userId, notificationId, scheduledFor);
    if (snoozed === 0) {
      throw new Error('Notification is no longer pending and cannot be snoozed');
    }
    return { snoozed: true, scheduledFor };
  }

  /**
   * Handle routine block check-in responses.
   * Updates the notification and creates/updates the RoutineLog.
   */
  private async handleRoutineCheckIn(
    userId: UserId,
    notification: any,
    action: string,
    options?: { actualStartTime?: string; actualEndTime?: string; replacementActivity?: string }
  ): Promise<NotificationLog> {
    // Mark notification as read/responded
    const updatedNotification = await this.notificationRepository.markReadWithCheckIn(
      userId,
      notification.id,
      action,
      options?.actualStartTime,
      options?.actualEndTime,
      options?.replacementActivity
    );

    // If this is a routine check-in notification, update the RoutineLog
    if (notification.type === 'ROUTINE_START_CHECKIN' || notification.type === 'ROUTINE_COMPLETION_CHECKIN') {
      const blockId = notification.routineBlockId;
      const blockDate = notification.blockDate;
      
      if (blockId && blockDate) {
        await this.updateRoutineLogFromCheckIn(userId, blockId, blockDate, action, options);
      }
    }

    return updatedNotification;
  }

  /**
   * Update RoutineLog based on check-in response.
   */
  private async updateRoutineLogFromCheckIn(
    userId: UserId,
    blockId: string,
    blockDate: string,
    action: string,
    options?: { actualStartTime?: string; actualEndTime?: string; replacementActivity?: string }
  ): Promise<void> {
    const routineRepo = new (await import('@/server/repositories/routine.repository')).RoutineRepository();
    
    const existingLog = await routineRepo.findLog(blockId, toUserId(userId), blockDate);
    
    const isStartCheckIn = action.startsWith('STARTED_');
    const isCompletionCheckIn = action.startsWith('FINISHED_') || action === 'NOT_COMPLETED';
    const isBusyWithOther = action === 'BUSY_WITH_OTHER';
    const isSkipBlock = action === 'SKIP_BLOCK';

    // Determine the status and times from the action
    let status: 'COMPLETED' | 'MISSED' | 'PARTIAL' | 'IN_PROGRESS' = 'IN_PROGRESS';
    let actualStartTime: string | null = null;
    let actualEndTime: string | null = null;
    let completionSource: 'USER_CONFIRMED' | 'AUTO_ASSUMED' | 'MANUAL_EDIT' | 'CHECKIN_COMPLETION' | undefined;
    let note: string | null = null;

    if (isStartCheckIn) {
      if (action === 'STARTED_ON_TIME') {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
      } else if (action === 'STARTED_LATE' || action === 'STARTED_EARLY') {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
      } else if (isBusyWithOther) {
        status = 'IN_PROGRESS';
        actualStartTime = options?.actualStartTime ?? null;
        note = `Replaced with: ${options?.replacementActivity ?? 'Other activity'}`;
      } else if (isSkipBlock) {
        status = 'MISSED';
        completionSource = 'USER_CONFIRMED';
      }
    } else if (isCompletionCheckIn) {
      if (action === 'NOT_COMPLETED') {
        status = 'MISSED';
        completionSource = 'USER_CONFIRMED';
      } else {
        status = 'COMPLETED';
        actualEndTime = options?.actualEndTime ?? null;
        // If start wasn't confirmed earlier, use the start from options or scheduled time
        if (!existingLog?.actualStartTime) {
          actualStartTime = options?.actualStartTime ?? null;
        }
        completionSource = 'USER_CONFIRMED';
      }
    }

    // Calculate duration if both times available
    let durationMinutes: number | null = null;
    if (actualStartTime && actualEndTime) {
      const startParts = actualStartTime.split(':');
      const endParts = actualEndTime.split(':');
      const startH = Number(startParts[0]);
      const startM = Number(startParts[1]);
      const endH = Number(endParts[0]);
      const endM = Number(endParts[1]);
      if (!Number.isNaN(startH) && !Number.isNaN(startM) && !Number.isNaN(endH) && !Number.isNaN(endM)) {
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        durationMinutes = endMinutes >= startMinutes ? endMinutes - startMinutes : (24 * 60 - startMinutes) + endMinutes;
      }
    }

    await routineRepo.upsertLog(toUserId(userId), blockId, blockDate, {
      status,
      actualStartTime,
      actualEndTime,
      durationMinutes,
      note,
      completionSource,
    });
  }

  /**
   * Get unread notification count for the badge
   */
  async getUnreadCount(userId: UserId): Promise<number> {
    return this.notificationRepository.unreadCount(userId);
  }

  /**
   * Mark a single notification as read (ownership-checked)
   */
  async markRead(userId: UserId, notificationId: string): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    return this.notificationRepository.markRead(userId, notificationId);
  }

  /**
   * Mark all notifications as read; returns affected count
   */
  async markAllRead(userId: UserId): Promise<{ success: boolean; count: number }> {
    const count = await this.notificationRepository.markAllRead(userId);
    return { success: true, count };
  }

  /**
   * Dismiss a single notification (ownership-checked; idempotent).
   */
  async dismiss(userId: UserId, notificationId: string): Promise<NotificationLog> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    const dismissed = await this.notificationRepository.markDismissed(userId, notificationId);
    if (dismissed === 0) {
      return existing;
    }
    return { ...existing, status: NotificationStatus.DISMISSED };
  }

  /**
   * Delete a notification (ownership-checked)
   */
  async delete(userId: UserId, notificationId: string): Promise<{ success: boolean }> {
    const existing = await this.notificationRepository.findById(userId, notificationId);
    if (!existing) {
      throw new Error('Notification not found');
    }
    await this.notificationRepository.delete(userId, notificationId);
    return { success: true };
  }

  /**
   * Notify the user that a goal is due soon or overdue
   */
  async notifyGoalDue(
    userId: UserId,
    goal: { id: string; title: string; dueDate?: Date | null; endDate?: Date | null },
  ): Promise<NotificationLog> {
    return this.createNotification(userId, {
      type: NotificationType.GOAL_DEADLINE,
      title: `Goal due: ${goal.title}`,
      body:
        (goal.dueDate ?? goal.endDate)
          ? `Your goal "${goal.title}" is due on ${
              (goal.dueDate ?? goal.endDate)?.toISOString().split('T')[0]
            }.`
          : `Your goal "${goal.title}" is approaching its deadline.`,
      relatedEntityId: goal.id,
      actionUrl: `/goals/${goal.id}`,
      scheduledFor: new Date(),
    });
  }

  /**
   * Notify the user about a habit reminder
   */
  async notifyHabitReminder(
    userId: UserId,
    habit: { id: string; name: string },
    scheduledFor: Date = new Date(),
  ): Promise<NotificationLog> {
    return this.createNotification(userId, {
      type: NotificationType.HABIT_REMINDER,
      title: `Habit reminder: ${habit.name}`,
      body: `Don't forget to complete "${habit.name}" today.`,
      relatedEntityId: habit.id,
      actionUrl: `/habits/${habit.id}`,
      scheduledFor,
    });
  }

  /**
   * Notify the user that an achievement was unlocked.
   *
   * `actionUrl` used to be `/achievements/${achievement.id}`, which is a 404: the
   * page is one route at `/achievements` with no `[id]` segment. It is now built
   * by `achievementDeepLink` from the **definition** id, which is what the page's
   * `?highlight=` reads. `id` stays in the signature because it is also recorded as
   * `relatedEntityId`, which is the row and genuinely is the row.
   */
  async notifyAchievement(
    userId: UserId,
    achievement: { id: string; title: string; definitionId?: string | null },
    scheduledFor: Date = new Date(),
  ): Promise<NotificationLog> {
    const definitionId = achievement.definitionId ?? null;
    return this.createNotification(userId, {
      type: NotificationType.ACHIEVEMENT_UNLOCKED,
      title: `Achievement unlocked: ${achievement.title}`,
      body: `You unlocked the "${achievement.title}" achievement. Keep it up!`,
      relatedEntityId: achievement.id,
      actionUrl: definitionId === null ? ACHIEVEMENTS_PATH : achievementDeepLink(definitionId),
      scheduledFor,
    });
  }

  /**
   * Deliver every notification whose `scheduledFor` has now passed.
   *
   * Without this, the routine/habit/goal/weekly reminder modules enqueue rows
   * that stay `PENDING` forever: nothing else reads them on a wall clock.
   * (`SLEEP_PROMPT` is excluded — see `DISPATCH_EXCLUDED_TYPES`.)
   *
   * In-app delivery needs no work: the row itself is the in-app notification
   * and is already visible, because `findAll` filters on `readAt`/`dismissedAt`
   * rather than `status`. So a row is only "sent" once its out-of-app channels
   * have been attempted, and the channel flags record what actually went out.
   *
   * Failures are recorded per row and never abort the batch, so one bad
   * address cannot block the rest of the queue.
   */
  async dispatchDueNotifications(
    limitOrOptions: number | { limit?: number; userId?: string } = DISPATCH_BATCH_SIZE,
  ): Promise<DispatchResult> {
    const options =
      typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions;
    const limit = options.limit ?? DISPATCH_BATCH_SIZE;
    const now = new Date();
    const result: DispatchResult = {
      claimed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      byChannel: { email: false, push: false, sms: false },
    };

    const due = await this.notificationRepository.findDueForDispatch(
      now,
      limit,
      DISPATCH_EXCLUDED_TYPES,
      toUserIdOptional(options.userId),
      DISPATCH_MAX_RETRIES,
    );
    result.claimed = due.length;

    for (const notification of due) {
      const settings = notification.user.settings;

      // No settings row means notifications were never configured; treat the
      // default as "on" so a fresh user still gets reminders.
      const enabled = settings?.notificationsEnabled ?? true;
      if (!enabled) {
        // Opted out everywhere: retire the row without contacting any channel.
        const marked = await this.notificationRepository.markSent(
          toUserId(notification.userId),
          notification.id,
        );
        if (marked > 0) result.skipped += 1;
        continue;
      }

      // Per-category opt-out. A user who switched off habit reminders must not
      // receive queued habit reminders even though the master switch is on.
      const gate = CATEGORY_GATES[notification.type];
      if (gate && (settings as CategorySettings | null)?.[gate] === false) {
        const marked = await this.notificationRepository.markSent(
          toUserId(notification.userId),
          notification.id,
        );
        if (marked > 0) result.skipped += 1;
        continue;
      }

      const channels: DeliveryChannels = { email: false, push: false, sms: false };
      const failures: string[] = [];

      /*
       * The email channel is deliberately absent.
       *
       * This application does not send email, so the delivery attempt, the
       * `sendEmail` transport and the `src/emails` React templates have all been
       * removed rather than left dormant behind a feature flag.
       *
       * `channels.email` is still reported as `false` rather than omitted,
       * because `DeliveryChannels` is part of the stored `NotificationLog`
       * contract — a row written before this change has a real `email` flag in
       * it, and dropping the key would make those rows read as "never attempted"
       * rather than "not applicable any more".
       *
       * Push is untouched and remains the only delivery channel.
       */

      if (settings?.pushNotifications ?? true) {
        try {
          /**
           * Forward the action buttons and the row's own id.
           *
           * Without `notificationId` the service worker has nothing to send an
           * action button to, so a reminder could only ever be opened, never
           * acknowledged. `actionData` carries `{ actions: [...] }` as written
           * by the routine producer.
           */
          const actionData = parseActionData(notification.actionData);
          const push = await pushService.sendToUser(toUserId(notification.userId), {
            title: notification.title,
            body: notification.body ?? undefined,
            url: notification.actionUrl ?? undefined,
            ...(actionData.actions.length > 0 ? { actions: actionData.actions } : {}),
            data: {
              ...actionData.rest,
              notificationId: notification.id,
              ...(actionData.promptId ? { promptId: actionData.promptId } : {}),
            },
          });
          if (push.sent > 0) channels.push = true;
          /**
           * The actual reason from `pushService` carries the diagnosis — a VAPID
           * mismatch, a dead subscription, an expired endpoint. Collapsing it to
           * "1 push subscription(s) failed" is why a real delivery failure was
           * invisible and had to be reproduced out-of-band to diagnose.
           */
          if (push.failed > 0) {
            failures.push(
              push.reason
                ? `${push.failed} push subscription(s) failed: ${push.reason}`
                : `${push.failed} push subscription(s) failed`
            );
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'push threw');
        }
      }

      if (failures.length > 0) {
        const marked = await this.notificationRepository.markFailed(
          toUserId(notification.userId),
          notification.id,
          failures.join('; '),
          DISPATCH_MAX_RETRIES,
        );
        if (marked > 0) result.failed += 1;
        continue;
      }

      // `markSent` is guarded on status = PENDING, so a row another worker
      // already claimed reports 0 and is not counted twice.
      const marked = await this.notificationRepository.markSent(
        toUserId(notification.userId),
        notification.id,
        channels,
      );
      if (marked > 0) {
        result.sent += 1;
        result.byChannel.email ||= channels.email;
        result.byChannel.push ||= channels.push;
        result.byChannel.sms ||= channels.sms;
      }
    }

    return result;
  }

  /**
   * Cancel all pending notifications for a specific routine block.
   * Called when a block is updated or deleted to prevent stale notifications.
   */
  async cancelBlockNotifications(
    userId: UserId,
    blockId: string
  ): Promise<number> {
    const typesToCancel = [
      NotificationType.ROUTINE_PRE_START,
      NotificationType.ROUTINE_START,
      NotificationType.ROUTINE_COMPLETION,
      NotificationType.ROUTINE_END_REMINDER,
    ];

    let cancelled = 0;
    for (const type of typesToCancel) {
      const pending = await this.notificationRepository.findPendingByType(userId, [type]);
      for (const notification of pending) {
        if (notification.relatedEntityId === blockId) {
          await this.notificationRepository.markDismissed(userId, notification.id);
          cancelled++;
        }
      }
    }
    return cancelled;
  }

  /**
   * Retry unanswered notifications based on user's retry policy.
   * Finds notifications that have been pending for longer than the retry intervals
   * and creates follow-up notifications.
   */
  async retryUnansweredNotifications(
    userId: UserId,
    now: Date = new Date()
  ): Promise<number> {
    const settings = await this.userRepository.getSettings(userId);
    if (!settings?.notificationRetryEnabled) return 0;
    if (settings.notificationsEnabled === false) return 0;

    const retryIntervals = this.parseRetryIntervals(settings.notificationRetryIntervals);
    const maxRetries = settings.notificationMaxRetries ?? 3;

    let retried = 0;

    // Find all pending notifications for this user
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.ROUTINE_PRE_START,
      NotificationType.ROUTINE_START,
      NotificationType.ROUTINE_COMPLETION,
      NotificationType.ROUTINE_END_REMINDER,
      NotificationType.HABIT_REMINDER,
      NotificationType.GOAL_DEADLINE,
    ]);

    for (const notification of pending) {
      // Check if this notification has a retry count in actionData
      const actionData = notification.actionData ? JSON.parse(notification.actionData) : {};
      const retryCount = actionData.retryCount ?? 0;
      const scheduledFor = new Date(notification.scheduledFor);
      const elapsedMinutes = (now.getTime() - scheduledFor.getTime()) / 60000;

      // Check if we should retry based on intervals
      const nextInterval = retryIntervals[retryCount];
      if (nextInterval === undefined || retryCount >= maxRetries) continue;
      if (elapsedMinutes < nextInterval) continue;

      // Create a follow-up notification
      await this.createRetryNotification(userId, notification, retryCount + 1);
      retried++;
    }

    return retried;
  }

  private parseRetryIntervals(intervalsJson: string | null | undefined): number[] {
    if (!intervalsJson) return [5, 15, 30]; // Default: 5min, 15min, 30min
    try {
      const parsed = JSON.parse(intervalsJson);
      if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number' && n > 0)) {
        return parsed;
      }
    } catch {
      // Invalid JSON, use defaults
    }
    return [5, 15, 30];
  }

  private async createRetryNotification(
    userId: UserId,
    originalNotification: any,
    retryCount: number
  ): Promise<void> {
    await this.notificationRepository.create(userId, {
      type: originalNotification.type,
      title: originalNotification.title,
      body: `Follow-up: ${originalNotification.body ?? ''}`,
      actionUrl: originalNotification.actionUrl,
      relatedEntityId: originalNotification.relatedEntityId,
      actionData: JSON.stringify({
        ...JSON.parse(originalNotification.actionData ?? '{}'),
        retryCount,
        originalNotificationId: originalNotification.id,
      }),
      scheduledFor: new Date(),
      status: NotificationStatus.PENDING,
    });
  }
}

export const notificationService = new NotificationService();
