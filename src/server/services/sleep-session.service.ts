import {
  NotificationStatus,
  NotificationType,
  SleepStartSource,
  type SleepLog,
  type SleepSession,
  type UserSettings,
} from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { SleepSessionRepository } from '@/server/repositories/sleep-session.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { NotificationRepository } from '@/server/repositories/notification.repository';
import { notificationService } from '@/server/services/notification.service';
import { pushService } from '@/server/services/push.service';
import { getTodayString, formatMinutes, DEFAULT_TZ } from '@/lib/dates';

/**
 * Sleep Session Service v2
 *
 * Sleep prompts fire at the user's targetBedtime in their timezone and are
 * exempt from quiet hours. A prompt is identified by the per-day key
 * `sleep-prompt:<localDate>` (stored in NotificationLog.relatedEntityId) and
 * created at most once per day. A pending prompt auto-starts a session after
 * `sleepAutoStartAfterMinutes` (source AUTO_NO_RESPONSE, startedAt = bedtime).
 * Responding YES resolves it immediately (source USER_CONFIRMED); NOT_YET
 * dismisses it. Stopping a session persists a SleepLog for the wake date
 * without clobbering manually-entered quality/notes.
 */

export interface SleepPromptView {
  id: string;
  promptKey: string;
  targetBedtime: string;
  scheduledFor: string; // ISO timestamp
  autoStartAfterMinutes: number;
  secondsUntilAutoStart: number;
}

export interface SleepState {
  timezone: string;
  active: SleepSession | null;
  prompt: SleepPromptView | null;
  todaySleepLog: SleepLog | null;
}

export interface StartSleepResult {
  session: SleepSession;
  alreadyActive: boolean;
}

export interface StopSleepResult {
  session: SleepSession;
  log: SleepLog;
  bedtime: string;
  wakeTime: string;
  durationMinutes: number;
  deficitMinutes: number;
}

export interface RespondResult {
  session: SleepSession | null;
  answer: 'YES' | 'NOT_YET';
  alreadyHandled: boolean;
}

export interface CronResult {
  usersProcessed: number;
  promptsCreated: number;
  autoStarted: number;
}

export class SleepSessionService {
  private sessionRepository: SleepSessionRepository;
  private sleepRepository: SleepRepository;
  private timeEntryRepository: TimeEntryRepository;
  private userRepository: UserRepository;
  private notificationRepository: NotificationRepository;

  constructor() {
    this.sessionRepository = new SleepSessionRepository();
    this.sleepRepository = new SleepRepository();
    this.timeEntryRepository = new TimeEntryRepository();
    this.userRepository = new UserRepository();
    this.notificationRepository = new NotificationRepository();
  }

  private async getTimezone(userId: string): Promise<string> {
    const settings = await this.userRepository.getSettings(userId);
    return settings?.timezone || DEFAULT_TZ;
  }

  private async getSettings(userId: string): Promise<UserSettings | null> {
    return this.userRepository.getSettings(userId);
  }

  private hmToDate(localDate: string, hm: string, timezone: string): Date {
    return fromZonedTime(`${localDate}T${hm}:00`, timezone);
  }

  private promptKeyFor(localDate: string): string {
    return `sleep-prompt:${localDate}`;
  }

  /**
   * Create today's sleep prompt if it is due (now >= targetBedtime in user tz)
   * and there is no active session or existing log. Idempotent per day via
   * the `sleep-prompt:<localDate>` key.
   */
  private async ensureSleepPrompt(
    userId: string,
    settings: UserSettings | null,
    now: Date
  ): Promise<boolean> {
    if (!settings || settings.sleepReminder !== true) return false;
    if (settings.notificationsEnabled !== true) return false;
    const targetBedtime = settings.targetBedtime?.trim();
    if (!targetBedtime) return false;

    const timezone = settings.timezone || DEFAULT_TZ;
    const localDate = getTodayString(timezone);
    const promptKey = this.promptKeyFor(localDate);

    const [existing] = await Promise.all([this.notificationRepository.countByTypeAndRelatedId(
      userId,
      NotificationType.SLEEP_PROMPT,
      promptKey
    )]);
    if (existing > 0) return false;

    const bedtimeAt = this.hmToDate(localDate, targetBedtime, timezone);
    if (now.getTime() < bedtimeAt.getTime()) return false;

    const [hasActive, hasLog] = await Promise.all([
      this.sessionRepository.findActive(userId),
      this.sleepRepository.findByDate(userId, localDate),
    ]);
    if (hasActive || hasLog) return false;

    const autoStartMinutes = settings.sleepAutoStartAfterMinutes ?? 15;
    const created = await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_PROMPT,
        title: 'Time to sleep',
        body: `Your target bedtime is ${targetBedtime}. Sleep will start automatically in ${autoStartMinutes} minutes unless you say "Not yet".`,
        relatedEntityId: promptKey,
        scheduledFor: now,
        status: NotificationStatus.PENDING,
        actionUrl: '/today',
      })
      .catch(() => null);
    if (created) {
      await pushService
        .notify(userId, {
          title: 'Time to sleep',
          body: `Your target bedtime is ${targetBedtime}. Sleep will start automatically in ${autoStartMinutes} minutes unless you say "Not yet".`,
          url: '/today',
          actions: [
            { action: 'sleep-start', title: 'Yes, start sleep' },
            { action: 'sleep-dismiss', title: 'Not yet' },
          ],
          data: { promptId: created.id },
        })
        .catch(() => undefined);
    }

    return true;
  }

  private async promptView(
    userId: string,
    now: Date,
    settings: UserSettings | null
  ): Promise<SleepPromptView | null> {
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.SLEEP_PROMPT,
    ]);
    const prompt = pending[0] ?? null;
    if (!prompt) return null;

    const autoStartMinutes = settings?.sleepAutoStartAfterMinutes ?? 15;
    const autoStartMs = autoStartMinutes * 60000;
    return {
      id: prompt.id,
      promptKey: prompt.relatedEntityId ?? '',
      targetBedtime: settings?.targetBedtime?.trim() ?? '',
      scheduledFor: prompt.scheduledFor.toISOString(),
      autoStartAfterMinutes: autoStartMinutes,
      secondsUntilAutoStart: Math.max(
        0,
        Math.ceil((prompt.scheduledFor.getTime() + autoStartMs - now.getTime()) / 1000)
      ),
    };
  }

  /**
   * Resolve the user's current sleep state, lazily creating today's prompt
   * when bedtime has passed. This is the single source the UI polls.
   */
  async resolveSleepState(
    userId: string,
    now: Date = new Date()
  ): Promise<SleepState> {
    const settings = await this.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;

    await this.ensureSleepPrompt(userId, settings, now);

    const [active, prompt, todayLog] = await Promise.all([
      this.sessionRepository.findActive(userId),
      this.promptView(userId, now, settings),
      this.sleepRepository.findByDate(userId, getTodayString(timezone)),
    ]);

    return { timezone, active, prompt, todaySleepLog: todayLog };
  }

  /**
   * Start a sleep session. Idempotent: returns the existing active session if
   * one is already running. Stops any active time counter first.
   */
  async startSleep(
    userId: string,
    options: { source?: SleepStartSource; promptKey?: string | null } = {}
  ): Promise<StartSleepResult> {
    const active = await this.sessionRepository.findActive(userId);
    if (active) {
      return { session: active, alreadyActive: true };
    }

    await this.timeEntryRepository.stopRunning(userId);

    const startedAt = new Date();
    const session = await this.sessionRepository.create(userId, {
      startedAt,
      source: options.source ?? SleepStartSource.MANUAL,
      promptKey: options.promptKey ?? null,
    });

    if (options.promptKey) {
      const pending = await this.notificationRepository.findPendingByType(
        userId,
        [NotificationType.SLEEP_PROMPT]
      );
      for (const p of pending) {
        if (p.relatedEntityId === options.promptKey) {
          await this.notificationRepository.markSent(userId, p.id);
        }
      }
    }

    const timezone = await this.getTimezone(userId);
    await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_TRACKING_STARTED,
        title: 'Sleep tracking started',
        body: `Sleep session started at ${formatInTimeZone(startedAt, timezone, 'HH:mm')}. Good night!`,
        status: NotificationStatus.SENT,
        scheduledFor: startedAt,
        actionUrl: '/today',
      })
      .catch(() => undefined);

    return { session, alreadyActive: false };
  }

  /**
   * Respond to a pending sleep prompt. YES resolves the prompt into an active
   * session (idempotent — the (userId, promptKey) unique constraint collapses
   * races with the auto-start path). NOT_YET dismisses the prompt.
   */
  async respondToPrompt(
    userId: string,
    promptId: string,
    answer: 'YES' | 'NOT_YET'
  ): Promise<RespondResult> {
    const prompt = await this.notificationRepository.findById(userId, promptId);
    if (!prompt) {
      const active = await this.sessionRepository.findActive(userId);
      return {
        session: active,
        answer,
        alreadyHandled: true,
      };
    }

    if (answer === 'NOT_YET') {
      await this.notificationRepository.markDismissed(userId, prompt.id);
      return { session: null, answer, alreadyHandled: false };
    }

    const promptKey = prompt.relatedEntityId ?? null;
    const settings = await this.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const startedAt = new Date();

    const session = promptKey
      ? await this.sessionRepository.createFromPrompt(
          userId,
          promptKey,
          startedAt,
          SleepStartSource.USER_CONFIRMED
        )
      : null;

    let resolvedSession = session;
    if (!resolvedSession && promptKey) {
      // Idempotent path: the auto-start beat us to it.
      resolvedSession = await this.sessionRepository.findByPromptKey(
        userId,
        promptKey
      );
    }

    if (resolvedSession) {
      await this.timeEntryRepository.stopRunning(userId);
      await this.notificationRepository.markSent(userId, prompt.id);
      await notificationService
        .createNotification(userId, {
          type: NotificationType.SLEEP_TRACKING_STARTED,
          title: 'Sleep tracking started',
body: `Sleep session started at ${formatInTimeZone(startedAt, timezone, 'HH:mm')}. Good night!`,
          status: NotificationStatus.SENT,
          scheduledFor: startedAt,
          actionUrl: '/today',
        })
        .catch(() => undefined);
    }

    return {
      session: resolvedSession,
      answer,
      alreadyHandled: session === null && resolvedSession === null,
    };
  }

  /**
   * Stop the active sleep session and persist a SleepLog for the wake date.
   * Times/duration are written; user-entered quality/feltRested/notes are left
   * untouched.
   */
  async stopSleep(userId: string, now: Date = new Date()): Promise<StopSleepResult> {
    const active = await this.sessionRepository.findActive(userId);
    if (!active) {
      throw new Error('No active sleep session');
    }

    const endedAt = now;
    const durationMinutes = Math.max(
      1,
      Math.round((endedAt.getTime() - active.startedAt.getTime()) / 60000)
    );

    const session = await this.sessionRepository.end(
      userId,
      active.id,
      endedAt,
      durationMinutes
    );

    const timezone = await this.getTimezone(userId);
    const wakeDate = getTodayString(timezone);
    const bedtime = formatInTimeZone(active.startedAt, timezone, 'HH:mm');
    const wakeTime = formatInTimeZone(endedAt, timezone, 'HH:mm');

    const log = await this.sleepRepository.upsertLog(userId, wakeDate, {
      user: { connect: { id: userId } },
      actualBedtime: bedtime,
      actualWakeTime: wakeTime,
      actualDurationMinutes: durationMinutes,
    });

    const settings = await this.getSettings(userId);
    const minSleepMinutes = settings?.minSleepDuration ?? 480;
    const deficitMinutes = Math.max(0, minSleepMinutes - durationMinutes);

    await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_ENDED,
        title: 'Good morning',
        body:
          deficitMinutes > 0
            ? `You slept ${formatMinutes(durationMinutes)} (${bedtime} \u2013 ${wakeTime}). That's ${formatMinutes(deficitMinutes)} below your target.`
            : `You slept ${formatMinutes(durationMinutes)} (${bedtime} \u2013 ${wakeTime}).`,
        status: NotificationStatus.SENT,
        scheduledFor: endedAt,
        actionUrl: '/today',
      })
      .catch(() => undefined);

    return { session, log, bedtime, wakeTime, durationMinutes, deficitMinutes };
  }

  /**
   * Cron worker (called frequently by an external scheduler; lazily also from
   * app requests):
   * 1. Create today's SLEEP_PROMPT for users whose bedtime has passed.
   * 2. Auto-start sleep for exceeded prompts (source AUTO_NO_RESPONSE) with
   *    startedAt = today's target bedtime, so the persisted log matches the
   *    plan.
   */
  async processSleepNotifications(
    now: Date = new Date()
  ): Promise<CronResult> {
    const settingsList = await this.userRepository.findUsersWithSleepPromptsEnabled();
    let promptsCreated = 0;
    let autoStarted = 0;

    for (const settings of settingsList) {
      const timezone = settings.timezone || DEFAULT_TZ;
      const targetBedtime = settings.targetBedtime?.trim();
      if (!targetBedtime) continue;

      const created = await this.ensureSleepPrompt(settings.userId, settings, now);
      if (created) promptsCreated += 1;

      const pending = await this.notificationRepository.findPendingByType(
        settings.userId,
        [NotificationType.SLEEP_PROMPT]
      );
      const autoStartMinutes = settings.sleepAutoStartAfterMinutes ?? 15;
      const autoStartMs = autoStartMinutes * 60000;

      for (const prompt of pending) {
        if (now.getTime() - prompt.scheduledFor.getTime() < autoStartMs) continue;
        const promptKey = prompt.relatedEntityId;
        if (!promptKey) continue;

        const localDate = getTodayString(timezone);
        const startedAt = this.hmToDate(localDate, targetBedtime, timezone);
        const session = await this.sessionRepository.createFromPrompt(
          settings.userId,
          promptKey,
          startedAt,
          SleepStartSource.AUTO_NO_RESPONSE
        );
        if (!session) continue; // already resolved (manual yes / prior run)

        await this.timeEntryRepository.stopRunning(settings.userId);
        await this.notificationRepository.markSent(settings.userId, prompt.id);
        await notificationService
          .createNotification(settings.userId, {
            type: NotificationType.SLEEP_TRACKING_STARTED,
            title: 'Sleep tracking started',
            body: `You didn't respond, so sleep was auto-started at ${targetBedtime}. Good night!`,
            status: NotificationStatus.SENT,
            scheduledFor: startedAt,
            actionUrl: '/today',
          })
          .catch(() => undefined);
        await pushService
          .notify(settings.userId, {
            title: 'Sleep tracking started',
            body: `You didn't respond, so sleep was auto-started at ${targetBedtime}. Good night!`,
            url: '/today',
          })
          .catch(() => undefined);
        autoStarted += 1;
      }
    }

    return {
      usersProcessed: settingsList.length,
      promptsCreated,
      autoStarted,
    };
  }
}

export const sleepSessionService = new SleepSessionService();