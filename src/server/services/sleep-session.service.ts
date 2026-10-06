import {
  NotificationStatus,
  NotificationType,
  SleepStartSource,
  type SleepLog,
  type SleepSession,
  type UserSettings,
} from '@/generated/prisma';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { SleepSessionRepository } from '@/server/repositories/sleep-session.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { NotificationRepository } from '@/server/repositories/notification.repository';
import { notificationService } from '@/server/services/notification.service';
import { pushService } from '@/server/services/push.service';
import { getTodayString, formatMinutes, DEFAULT_TZ } from '@/lib/dates';
import { toUserId, type UserId } from '@/types/ids';

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
 *
 * Pre-warning: fires at `sleepPreWarningTime` (default 23:00) to remind user
 * bedtime is approaching. Configurable via `sleepPreWarningEnabled`.
 *
 * Wake confirmation: fires at `targetWakeTime` (or `wakeConfirmationTime`) to
 * confirm actual wake time. Actions: "Woke at target", "Woke later", "Still sleeping".
 */

export interface SleepPromptView {
  id: string;
  promptKey: string;
  targetBedtime: string;
  scheduledFor: string; // ISO timestamp
  autoStartAfterMinutes: number;
  secondsUntilAutoStart: number;
}

export interface SleepPreWarningView {
  id: string;
  targetBedtime: string;
  preWarningTime: string;
  scheduledFor: string;
}

export interface SleepWakePromptView {
  id: string;
  targetWakeTime: string;
  scheduledFor: string;
}

export interface SleepState {
  timezone: string;
  active: SleepSession | null;
  prompt: SleepPromptView | null;
  preWarning: SleepPreWarningView | null;
  wakePrompt: SleepWakePromptView | null;
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
  preWarningsCreated: number;
  wakePromptsCreated: number;
  autoStarted: number;
}

/**
 * How long after target bedtime the "time to sleep" prompt stays eligible.
 *
 * A bedtime is a **window**, not an instant. The original gate was only
 * `now >= bedtimeAt` with no upper bound, which is harmless for an 23:00 bedtime
 * (the prompt is created at 23:01 and the next poll de-dupes it) but catastrophic
 * for a bedtime of `00:00`: `now >= today 00:00` is true for the entire day, so
 * the prompt was created at 00:01 and stayed due for the next 23 hours. The
 * auto-start then fired on an afternoon tick and opened a session stamped at
 * midnight, which nothing ever closed — a 17-hour "active sleep" at 16:50 with
 * "Started at 12:00 AM / auto-started".
 *
 * 90 minutes tolerates a late or missed cron tick without re-arming the prompt
 * hours later.
 */
const SLEEP_PROMPT_WINDOW_MS = 90 * 60 * 1000;

/**
 * An open session older than this, in the user's own timezone, cannot still be a
 * real sleep.
 *
 * The longest plausible night is ~14h; 16h is the same threshold the client
 * already uses to show its "still sleeping?" dialog (`useSleepSession.ts`,
 * `LONG_SESSION_MS`). Past it the session is cancelled rather than left to
 * distort the day's score forever.
 */
const MAX_SESSION_AGE_MS = 16 * 60 * 60 * 1000;

/**
 * How long before/after the pre-warning time the notification stays eligible.
 * Default pre-warning is at 23:00 (1 hour before midnight bedtime).
 * 90 minute window tolerates late/missed cron ticks.
 */
const PRE_WARNING_WINDOW_MS = 90 * 60 * 1000;

/**
 * How long after target wake time the wake confirmation stays eligible.
 * 2 hour window - user might wake up late or ignore alarm initially.
 */
const WAKE_CONFIRMATION_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Default pre-warning time (23:00) when not configured.
 */
const DEFAULT_PRE_WARNING_TIME = '23:00';

/**
 * Prompt key prefixes for different sleep notification types.
 */
const PRE_WARNING_KEY_PREFIX = 'sleep-pre-warning:';
const WAKE_PROMPT_KEY_PREFIX = 'sleep-wake-prompt:';

/**
 * Minutes past midnight for a strict `HH:mm`, or null if it is not one.
 *
 * Deliberately strict: the settings schema already rejects `99:99`, and this
 * keeps the "no usable time supplied" path distinguishable from midnight.
 */
function hhmmToMinutes(hm: string | null | undefined): number | null {
  if (typeof hm !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Elapsed minutes from bedtime to wake time across a night.
 *
 * A night crosses midnight for almost everyone, so this is computed from
 * clock-offsets rather than by subtracting two dates: if wake is not after
 * bedtime on the clock, the sleep spans midnight and a full day is added.
 * Without this, a 23:30 → 05:00 night evaluated to a negative duration and
 * `Math.max(1, …)` clamped it to a meaningless 1 minute.
 */
function overnightMinutes(bedtime: string, wakeTime: string): number | null {
  const bed = hhmmToMinutes(bedtime);
  const wake = hhmmToMinutes(wakeTime);
  if (bed === null || wake === null) return null;
  let diff = wake - bed;
  // Strictly `< 0`, not `<= 0`. Equal clock times resolved to a full 1440-minute
  // session here, which was then written as `actualDurationMinutes` and scored:
  // `deficitMinutes` became 0 and `calculateSleepScore` awarded the whole
  // duration share, so a mistaken or empty entry registered as a perfect night.
  if (diff < 0) diff += 24 * 60;
  return diff;
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

  private async getTimezone(userId: UserId): Promise<string> {
    const settings = await this.userRepository.getSettings(userId);
    return settings?.timezone || DEFAULT_TZ;
  }

  private async getSettings(userId: UserId): Promise<UserSettings | null> {
    return this.userRepository.getSettings(userId);
  }

  private hmToDate(localDate: string, hm: string, timezone: string): Date {
    return fromZonedTime(`${localDate}T${hm}:00`, timezone);
  }

  private promptKeyFor(localDate: string): string {
    return `sleep-prompt:${localDate}`;
  }

  private preWarningKeyFor(localDate: string): string {
    return `${PRE_WARNING_KEY_PREFIX}${localDate}`;
  }

  private wakePromptKeyFor(localDate: string): string {
    return `${WAKE_PROMPT_KEY_PREFIX}${localDate}`;
  }

  /**
   * Create today's sleep prompt if it is due (now >= targetBedtime in user tz)
   * and there is no active session or existing log. Idempotent per day via
   * the `sleep-prompt:<localDate>` key.
   */
  private async ensureSleepPrompt(
    userId: UserId,
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
    // Upper bound — see `SLEEP_PROMPT_WINDOW_MS`. Without it a `00:00` bedtime
    // leaves the prompt permanently due.
    if (now.getTime() - bedtimeAt.getTime() > SLEEP_PROMPT_WINDOW_MS) return false;

    const [hasActive, hasLog] = await Promise.all([
      this.sessionRepository.findActive(userId),
      this.sleepRepository.findByDate(userId, localDate),
    ]);
    if (hasActive || hasLog) return false;

    const autoStartMinutes = settings.sleepAutoStartAfterMinutes ?? 15;
    const autoStartEnabled = settings.sleepAutoStartEnabled !== false;
    // When auto-start is off, the prompt copy must not promise it will happen.
    const autoStartCopy = autoStartEnabled
      ? ` Sleep will start automatically in ${autoStartMinutes} minutes unless you say "Not yet".`
      : ' Tap to start sleep tracking when you are ready.';
    const created = await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_PROMPT,
        title: 'Time to sleep',
        body: `Your target bedtime is ${targetBedtime}.${autoStartCopy}`,
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
          body: `Your target bedtime is ${targetBedtime}.${autoStartCopy}`,
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

  /**
   * Create today's sleep pre-warning if it is due (now >= preWarningTime in user tz)
   * and there is no active session or existing log. Idempotent per day via key.
   */
  private async ensurePreSleepWarning(
    userId: UserId,
    settings: UserSettings | null,
    now: Date
  ): Promise<boolean> {
    if (!settings || settings.sleepPreWarningEnabled !== true) return false;
    if (settings.notificationsEnabled !== true) return false;
    const targetBedtime = settings.targetBedtime?.trim();
    if (!targetBedtime) return false;

    const timezone = settings.timezone || DEFAULT_TZ;
    const localDate = getTodayString(timezone);
    const promptKey = this.preWarningKeyFor(localDate);

    const [existing] = await Promise.all([this.notificationRepository.countByTypeAndRelatedId(
      userId,
      NotificationType.SLEEP_PRE_WARNING,
      promptKey
    )]);
    if (existing > 0) return false;

    const preWarningTime = settings.sleepPreWarningTime?.trim() || DEFAULT_PRE_WARNING_TIME;
    const preWarningAt = this.hmToDate(localDate, preWarningTime, timezone);
    if (now.getTime() < preWarningAt.getTime()) return false;
    if (now.getTime() - preWarningAt.getTime() > PRE_WARNING_WINDOW_MS) return false;

    const [hasActive, hasLog] = await Promise.all([
      this.sessionRepository.findActive(userId),
      this.sleepRepository.findByDate(userId, localDate),
    ]);
    if (hasActive || hasLog) return false;

    const created = await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_PRE_WARNING,
        title: 'Sleep schedule approaching',
        body: `Your sleep schedule starts in 1 hour (at ${targetBedtime}). Start winding down!`,
        relatedEntityId: promptKey,
        scheduledFor: now,
        status: NotificationStatus.PENDING,
        actionUrl: '/today',
      })
      .catch(() => null);
    if (created) {
      await pushService
        .notify(userId, {
          title: 'Sleep schedule approaching',
          body: `Your sleep schedule starts in 1 hour (at ${targetBedtime}). Start winding down!`,
          url: '/today',
        })
        .catch(() => undefined);
    }

    return true;
  }

  /**
   * Create today's wake confirmation prompt at targetWakeTime.
   * Idempotent per day via key.
   */
  private async ensureWakePrompt(
    userId: UserId,
    settings: UserSettings | null,
    now: Date
  ): Promise<boolean> {
    if (!settings || settings.wakeConfirmationEnabled !== true) return false;
    if (settings.notificationsEnabled !== true) return false;
    const targetWakeTime = settings.targetWakeTime?.trim() || settings.wakeConfirmationTime?.trim();
    if (!targetWakeTime) return false;

    const timezone = settings.timezone || DEFAULT_TZ;
    const localDate = getTodayString(timezone);
    const promptKey = this.wakePromptKeyFor(localDate);

    const [existing] = await Promise.all([this.notificationRepository.countByTypeAndRelatedId(
      userId,
      NotificationType.SLEEP_WAKE_CONFIRMATION,
      promptKey
    )]);
    if (existing > 0) return false;

    const wakeAt = this.hmToDate(localDate, targetWakeTime, timezone);
    if (now.getTime() < wakeAt.getTime()) return false;
    if (now.getTime() - wakeAt.getTime() > WAKE_CONFIRMATION_WINDOW_MS) return false;

    // Only create wake prompt if there's an active sleep session
    const active = await this.sessionRepository.findActive(userId);
    if (!active) return false;

    const created = await notificationService
      .createNotification(userId, {
        type: NotificationType.SLEEP_WAKE_CONFIRMATION,
        title: 'Good morning!',
        body: `Your target wake time is ${targetWakeTime}. Did you wake up now?`,
        relatedEntityId: promptKey,
        scheduledFor: now,
        status: NotificationStatus.PENDING,
        actionUrl: '/today',
        actionData: {
          actions: [
            { action: 'woke-at-target', title: `Yes, at ${targetWakeTime}` },
            { action: 'woke-later', title: 'I woke up later' },
            { action: 'still-sleeping', title: 'Still sleeping' },
          ],
        },
      })
      .catch(() => null);
    if (created) {
      await pushService
        .notify(userId, {
          title: 'Good morning!',
          body: `Your target wake time is ${targetWakeTime}. Did you wake up now?`,
          url: '/today',
          actions: [
            { action: 'woke-at-target', title: `Yes, at ${targetWakeTime}` },
            { action: 'woke-later', title: 'I woke up later' },
            { action: 'still-sleeping', title: 'Still sleeping' },
          ],
          data: { promptId: created.id },
        })
        .catch(() => undefined);
    }

    return true;
  }

  private async promptView(
    userId: UserId,
    now: Date,
    settings: UserSettings | null
  ): Promise<SleepPromptView | null> {
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.SLEEP_PROMPT,
    ]);
    const prompt = pending[0] ?? null;
    if (!prompt) return null;

    const autoStartEnabled = settings?.sleepAutoStartEnabled !== false;
    const autoStartMinutes = autoStartEnabled
      ? (settings?.sleepAutoStartAfterMinutes ?? 15)
      : 0;
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

  private async preWarningView(
    userId: UserId,
    _now: Date,
    settings: UserSettings | null
  ): Promise<SleepPreWarningView | null> {
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.SLEEP_PRE_WARNING,
    ]);
    const prompt = pending[0] ?? null;
    if (!prompt) return null;

    return {
      id: prompt.id,
      targetBedtime: settings?.targetBedtime?.trim() ?? '',
      preWarningTime: settings?.sleepPreWarningTime?.trim() ?? DEFAULT_PRE_WARNING_TIME,
      scheduledFor: prompt.scheduledFor.toISOString(),
    };
  }

  private async wakePromptView(
    userId: UserId,
    _now: Date,
    settings: UserSettings | null
  ): Promise<SleepWakePromptView | null> {
    const pending = await this.notificationRepository.findPendingByType(userId, [
      NotificationType.SLEEP_WAKE_CONFIRMATION,
    ]);
    const prompt = pending[0] ?? null;
    if (!prompt) return null;

    return {
      id: prompt.id,
      targetWakeTime: settings?.targetWakeTime?.trim() ?? settings?.wakeConfirmationTime?.trim() ?? '',
      scheduledFor: prompt.scheduledFor.toISOString(),
    };
  }

  /**
   * Can this open session still be a real night?
   *
   * Two ways to answer no:
   *  * It is older than {@link MAX_SESSION_AGE_MS}. Nothing else ever closes an
   *    `ACTIVE` session — `stopSleep` is the only writer of `COMPLETED` and is
   *    reached only when a human presses "I woke up" — so a forgotten session
   *    used to stay open indefinitely. Worse, `ensureSleepPrompt` refuses to
   *    create a prompt while one is active, so the zombie also suppressed every
   *    later night's prompt and the user had no way out but the green button.
   *  * Its `startedAt` is materially in the future. That is the cross-midnight
   *    artefact: a tick just after local midnight stamping `startedAt` with
   *    *tonight's* bedtime (~23h ahead). `TodaySleep` computes
   *    `Math.max(0, now - startedAt)`, which renders that as a cheerful
   *    `00:00:00` instead of surfacing the inconsistency.
   *
   * Cancelling is deliberate over writing a `SleepLog`: a fabricated 17-hour
   * sleep would silently corrupt the day's score, whereas a cancelled session
   * simply records nothing and the UI falls back to prompting.
   */
  private isSessionStale(session: SleepSession, now: Date): boolean {
    const age = now.getTime() - session.startedAt.getTime();
    // 5 minutes of tolerance so ordinary clock skew is not treated as a bug.
    if (age < -5 * 60 * 1000) return true;
    return age > MAX_SESSION_AGE_MS;
  }

  /**
   * Resolve the user's current sleep state, lazily creating today's prompt
   * when bedtime has passed. This is the single source the UI polls.
   */
  async resolveSleepState(
    userId: UserId,
    now: Date = new Date()
  ): Promise<SleepState> {
    const settings = await this.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;

    /**
     * Self-heal a stuck session *before* anything reads it.
     *
     * The repository already had `cancelAllActive` for exactly this and it had
     * zero call sites. Doing it here means a session stranded by a missed cron
     * tick clears itself on the next poll — no migration, no cron dependency,
     * and no manual database write.
     *
     * `findActive` runs first and only a genuinely stale session costs a second
     * lookup, so the normal path is unchanged.
     */
    const existing = await this.sessionRepository.findActive(userId);
    if (existing && this.isSessionStale(existing, now)) {
      await this.sessionRepository.cancelAllActive(userId);
    }

    // `ensureSleepPrompt` was awaited *before* the reads, so every poll ran
    // serially: settings → prompt-existence count → (maybe) active+log check →
    // (maybe) insert + push send → then the three reads. It is a side effect
    // that does not feed the reads, so it now runs alongside them. A prompt
    // created by this call surfaces on the next poll (≤15s) rather than
    // blocking the response.
    const [, , , active, prompt, preWarning, wakePrompt, todayLog] = await Promise.all([
      this.ensureSleepPrompt(userId, settings, now),
      this.ensurePreSleepWarning(userId, settings, now),
      this.ensureWakePrompt(userId, settings, now),
      this.sessionRepository.findActive(userId),
      this.promptView(userId, now, settings),
      this.preWarningView(userId, now, settings),
      this.wakePromptView(userId, now, settings),
      this.sleepRepository.findByDate(userId, getTodayString(timezone)),
    ]);

    return { timezone, active, prompt, preWarning, wakePrompt, todaySleepLog: todayLog };
  }

  /**
   * Start a sleep session. Idempotent: returns the existing active session if
   * one is already running. Stops any active time counter first.
   */
  async startSleep(
    userId: UserId,
    options: { source?: SleepStartSource; promptKey?: string | null } = {}
  ): Promise<StartSleepResult> {
    const active = await this.sessionRepository.findActive(userId);
    if (active) {
      return { session: active, alreadyActive: true };
    }

    await this.timeEntryRepository.stopRunning(userId);

    const startedAt = new Date();
    // Atomic insert-if-none-active. The `findActive` above is only a fast path:
    // on its own it is a check-then-act race, and two concurrent starts (a
    // double-clicked button, or a push "start sleep" landing beside a manual
    // start) both saw "none" and both inserted. Two ACTIVE rows then break
    // everything downstream: `stopSleep` ends only one, `ensureSleepPrompt`
    // suppresses every future bedtime prompt, and the cron auto-start skips.
    const { session, created } = await this.sessionRepository.createIfNoneActive(userId, {
      startedAt,
      source: options.source ?? SleepStartSource.MANUAL,
      promptKey: options.promptKey ?? null,
    });

    if (!created) {
      // Another request won the insert; adopt its session.
      return { session, alreadyActive: true };
    }

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
    userId: UserId,
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
   * Respond to a wake confirmation prompt.
   * Actions: 'woke-at-target' | 'woke-later' | 'still-sleeping'
   */
  async respondToWakePrompt(
    userId: UserId,
    promptId: string,
    action: 'woke-at-target' | 'woke-later' | 'still-sleeping',
    actualWakeTime?: string
  ): Promise<{ session: SleepSession | null; action: string; alreadyHandled: boolean }> {
    const prompt = await this.notificationRepository.findById(userId, promptId);
    if (!prompt) {
      const active = await this.sessionRepository.findActive(userId);
      return { session: active, action, alreadyHandled: true };
    }

    if (action === 'still-sleeping') {
      // Dismiss the wake prompt, keep session running
      await this.notificationRepository.markDismissed(userId, prompt.id);
      const active = await this.sessionRepository.findActive(userId);
      return { session: active, action, alreadyHandled: false };
    }

    // User confirms wake up - stop the session
    await this.notificationRepository.markSent(userId, prompt.id);

    let wakeTime: string | undefined;
    if (action === 'woke-at-target') {
      const settings = await this.getSettings(userId);
      wakeTime = settings?.targetWakeTime?.trim() || settings?.wakeConfirmationTime?.trim();
    } else if (action === 'woke-later' && actualWakeTime) {
      wakeTime = actualWakeTime;
    }

    if (wakeTime) {
      const result = await this.stopSleep(userId, new Date(), { wakeTime });
      return { session: result.session, action, alreadyHandled: false };
    }

    // Fallback - stop with current time
    const result = await this.stopSleep(userId, new Date(), {});
    return { session: result.session, action, alreadyHandled: false };
  }

  /**
   * Stop the active sleep session and persist a SleepLog for the wake date.
   *
   * `actual` carries the **times the user reported**, not the time they clicked.
   * Clicking "I woke up" is an interaction, not an observation: the button may
   * be pressed at 09:00 because the 05:00 alarm was ignored, or forgotten
   * entirely. `endedAt` used to be `now`, so the click timestamp silently became
   * `actualWakeTime` and drove both the duration and the day's sleep score —
   * precisely the "assumed sleep" behaviour that makes the data worthless.
   *
   * When no usable times are supplied this still falls back to the session
   * clock, so the button is never a dead end; the client is responsible for
   * asking first (see `TodaySleep`'s wake dialog).
   */
  async stopSleep(
    userId: UserId,
    now: Date = new Date(),
    actual: { bedtime?: string; wakeTime?: string } = {}
  ): Promise<StopSleepResult> {
    const active = await this.sessionRepository.findActive(userId);
    if (!active) {
      throw new Error('No active sleep session');
    }

    const timezone = await this.getTimezone(userId);

    // Normalise once: a supplied time is only used when it parses strictly, so a
    // malformed value falls back to the session clock instead of being written
    // through as-is. (The route already validates, but the service is reachable
    // from cron and tests too, so it does not assume a validated caller.)
    //
    // The `typeof` test is part of the same expression on purpose: a bare
    // `hhmmToMinutes(x) !== null` does not narrow `x`, so `x.trim()` would still
    // be flagged as possibly-undefined.
    const reportedBedtime =
      typeof actual.bedtime === 'string' && hhmmToMinutes(actual.bedtime) !== null
        ? actual.bedtime.trim()
        : null;
    const reportedWake =
      typeof actual.wakeTime === 'string' && hhmmToMinutes(actual.wakeTime) !== null
        ? actual.wakeTime.trim()
        : null;

    const bedtime = reportedBedtime ?? formatInTimeZone(active.startedAt, timezone, 'HH:mm');
    const wakeTime = reportedWake ?? formatInTimeZone(now, timezone, 'HH:mm');

    const reported = overnightMinutes(bedtime, wakeTime);
    const durationMinutes =
      reported ??
      Math.max(1, Math.round((now.getTime() - active.startedAt.getTime()) / 60000));

    /**
     * `endedAt` stays the moment of confirmation, not a synthesised instant.
     *
     * The authoritative reported values are the `HH:mm` strings written to the
     * `SleepLog`; deriving a fake `Date` from them would invent precision the
     * user never gave (and could land in the future for a wake time later than
     * `now`). Keeping `endedAt = now` means the row records when they actually
     * confirmed, while the log records when they actually slept.
     */
    const endedAt = now;

    const session = await this.sessionRepository.end(
      userId,
      active.id,
      endedAt,
      durationMinutes
    );

    const wakeDate = getTodayString(timezone);

    const settings = await this.getSettings(userId);
    const minSleepMinutes = settings?.minSleepDuration ?? 480;
    const deficitMinutes = Math.max(0, minSleepMinutes - durationMinutes);

    /**
     * Snapshot the target window onto the log. An auto-tracked session has no
     * client-supplied times, so without this `targetBedtime`/`targetWakeTime`
     * were never written on this path at all — which left the sleep card's
     * "Target" cell blank and `SleepQualityMeter` permanently unmeasurable.
     *
     * `deficitMinutes` belongs here too. It was computed just below and used
     * only for the notification body and the return value, never written, so
     * every session-tracked night stored `null` while the manual path
     * (`SleepService.logSleep`) stored a real number. Consumers then read it as
     * zero: `getSleepStats.totalDeficit` summed `l.deficitMinutes || 0` across
     * valid logs and analytics reported `deficitMinutes: latest.deficitMinutes`
     * — i.e. sleep debt was invisible for exactly the nights that were tracked
     * automatically.
     */
    const log = await this.sleepRepository.upsertLog(userId, wakeDate, {
      user: { connect: { id: userId } },
      actualBedtime: bedtime,
      actualWakeTime: wakeTime,
      actualDurationMinutes: durationMinutes,
      deficitMinutes,
      ...(settings?.targetBedtime?.trim() ? { targetBedtime: settings.targetBedtime.trim() } : {}),
      ...(settings?.targetWakeTime?.trim() ? { targetWakeTime: settings.targetWakeTime.trim() } : {}),
    });

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

    const { ScoringService } = await import('./scoring.service');
    await new ScoringService().calculateDailyScore(userId, wakeDate);

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
    let preWarningsCreated = 0;
    let wakePromptsCreated = 0;
    let autoStarted = 0;

    for (const settings of settingsList) {
      const timezone = settings.timezone || DEFAULT_TZ;
      const targetBedtime = settings.targetBedtime?.trim();
      if (!targetBedtime) continue;

      const userId = toUserId(settings.userId);

      // Clear a stranded session before anything consults it.
      //
      // The self-heal in `resolveSleepState` runs only when a client polls, and
      // that poll is itself gated on `document.visibilityState === 'visible'`.
      // A session orphaned by a missed cron tick or a closed laptop therefore
      // survived indefinitely and suppressed every later bedtime prompt
      // (`ensureSleepPrompt` returns early while any session is active) and the
      // cron auto-start below. The cron is the one thing guaranteed to run for
      // a user who never opens the app, so the cleanup belongs here.
      //
      // Only the stale row is cancelled, not every ACTIVE one: `cancelAllActive`
      // is an `updateMany`, so a single stale sibling would discard a
      // legitimately-running session too.
      const activeNow = await this.sessionRepository.findActive(userId);
      if (activeNow && this.isSessionStale(activeNow, now)) {
        await this.sessionRepository.cancelSession(activeNow.id, userId);
      }

      const created = await this.ensureSleepPrompt(userId, settings, now);
      if (created) promptsCreated += 1;

      // Create pre-warning notification (1 hour before bedtime)
      const preWarningCreated = await this.ensurePreSleepWarning(userId, settings, now);
      if (preWarningCreated) preWarningsCreated += 1;

      // Create wake confirmation notification (at target wake time)
      const wakeCreated = await this.ensureWakePrompt(userId, settings, now);
      if (wakeCreated) wakePromptsCreated += 1;

      const pending = await this.notificationRepository.findPendingByType(
        userId,
        [NotificationType.SLEEP_PROMPT]
      );
      // "Start sleep automatically" was previously ignored here: the cron
      // auto-started a session off `sleepAutoStartAfterMinutes` no matter what
      // the switch said, so turning it off only hid the minutes input in the UI.
      if (settings.sleepAutoStartEnabled === false) continue;
      const autoStartMinutes = settings.sleepAutoStartAfterMinutes ?? 15;
      const autoStartMs = autoStartMinutes * 60000;

      for (const prompt of pending) {
        if (now.getTime() - prompt.scheduledFor.getTime() < autoStartMs) continue;
        const promptKey = prompt.relatedEntityId;
        if (!promptKey) continue;

        const localDate = getTodayString(timezone);

        /**
         * A prompt from a previous day must never auto-start *tonight's*
         * session. `findPendingByType` is date-blind, so a prompt left PENDING
         * across midnight used to reach this loop, and because `startedAt` was
         * computed from `localDate` (today) it was stamped ~23h in the future.
         */
        if (promptKey !== this.promptKeyFor(localDate)) continue;

        const bedtimeAt = this.hmToDate(localDate, targetBedtime, timezone);

        // Same upper bound as `ensureSleepPrompt`, applied again here because
        // this loop can run on a prompt created before the bound existed.
        if (now.getTime() < bedtimeAt.getTime()) continue;
        if (now.getTime() - bedtimeAt.getTime() > SLEEP_PROMPT_WINDOW_MS) continue;

        // Never stack a second session on top of a running one. `ensureSleepPrompt`
        // refuses to create a prompt while one is active, but nothing stopped a
        // *stale* pending prompt from racing past that check.
        if (await this.sessionRepository.findActive(toUserId(settings.userId))) continue;

        // Clamp rather than trust the plan: if the tick lands inside the window
        // but slightly before the bedtime instant, back the start off to at most
        // the auto-start delay ago so `startedAt` can never be in the future.
        const startedAt = new Date(
          Math.max(bedtimeAt.getTime(), now.getTime() - autoStartMs)
        );

        const session = await this.sessionRepository.createFromPrompt(
          toUserId(settings.userId),
          promptKey,
          startedAt,
          SleepStartSource.AUTO_NO_RESPONSE
        );
        if (!session) continue; // already resolved (manual yes / prior run)

        await this.timeEntryRepository.stopRunning(toUserId(settings.userId));
        await this.notificationRepository.markSent(toUserId(settings.userId), prompt.id);
        /**
         * Copy no longer asserts that the user actually went to sleep.
         *
         * `AUTO_NO_RESPONSE` means only that nobody answered a prompt — it is not
         * evidence of anything. Saying "you didn't respond, so sleep was
         * auto-started" reads as a claim about behaviour, and the whole point of
         * the actual-times flow is that a missed prompt must never be treated as
         * confirmation. It starts *tracking*; the times stay correctable.
         */
        const startedBody = `Sleep tracking started for your ${targetBedtime} bedtime. You can correct the actual times later.`;
        await notificationService
          .createNotification(toUserId(settings.userId), {
            type: NotificationType.SLEEP_TRACKING_STARTED,
            title: 'Sleep tracking started',
            body: startedBody,
            status: NotificationStatus.SENT,
            scheduledFor: startedAt,
            actionUrl: '/today',
          })
          .catch(() => undefined);
        await pushService
          .notify(toUserId(settings.userId), {
            title: 'Sleep tracking started',
            body: startedBody,
            url: '/today',
          })
          .catch(() => undefined);
        autoStarted += 1;
      }
    }

    return {
      usersProcessed: settingsList.length,
      promptsCreated,
      preWarningsCreated,
      wakePromptsCreated,
      autoStarted,
    };
  }
}

export const sleepSessionService = new SleepSessionService();
