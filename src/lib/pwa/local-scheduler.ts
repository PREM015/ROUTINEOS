import { fromZonedTime } from 'date-fns-tz';
import { STORE_SCHEDULE, idbGetAll, idbPutAll } from '@/lib/offline/idb';
import { cacheList, cachePut, cacheGet } from '@/lib/offline/cache';
import {
  postToWorker,
  registerPeriodicSync,
  type ScheduledRecord,
} from '@/lib/pwa/offline-schedule';

/**
 * Builds notification records **locally** from a cached schedule, so reminders
 * keep firing after days offline — not just the ~48 h the server mirrors.
 *
 * ## Why this is separate from `offline-schedule.ts`
 *
 * `offline-schedule.ts` mirrors the server's *plan* (rows with `scheduledFor`)
 * into the worker. That plan only ever covers the horizon the server scheduled
 * ahead. If a device is offline for longer, there is nothing left to mirror.
 *
 * This module instead *derives* reminders from the cached resolved days
 * themselves, so it can project as far ahead as the cache extends. Both write to
 * the same `schedule` store and are de-duplicated by the same stable `id`, and
 * the worker suppresses a double-fire via `firedAt`.
 *
 * ## Day types are respected, not assumed
 *
 * Every cached day already carries the day type the server resolved for it (the
 * server applies the exception → natural-weekday → fallback rules). The builder
 * therefore never guesses a schedule: a cached "Placement Day" yields Placement
 * Day's blocks, a "College Day" yields College Day's blocks. There is no
 * hardcoded template.
 *
 * ## Purity
 *
 * {@link buildLocalSchedule} is a pure function of its inputs — no IndexedDB, no
 * `Date.now()` — which is what makes it unit-testable in the node test runner.
 */

export interface ScheduleBlockInput {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isRecurring?: boolean;
  trackCompletion?: boolean;
}

export interface ScheduleDayInput {
  /** `YYYY-MM-DD`, in the user's timezone. */
  date: string;
  /** The resolved day type (enum string) — carried through for diagnostics/labels. */
  dayType: string;
  dayTypeName?: string | null;
  blocks: ScheduleBlockInput[];
}

export interface LocalSchedulerSettings {
  timezone: string;
  notificationsEnabled?: boolean;
  routineStartNotifications?: boolean;
  upcomingRoutineNotifications?: boolean;
  advanceNotificationMinutes?: number;
  sleepReminder?: boolean;
  sleepPreWarningEnabled?: boolean;
  sleepPreWarningTime?: string | null;
  targetBedtime?: string | null;
  sleepAutoStartAfterMinutes?: number;
  wakeConfirmationEnabled?: boolean;
  targetWakeTime?: string | null;
  dailyReminder?: boolean;
  dailyReminderTime?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

export interface BuildLocalScheduleInput {
  days: ScheduleDayInput[];
  settings: LocalSchedulerSettings;
  /** Injectable clock so tests are deterministic. */
  now: Date;
  /** How far ahead to project. Defaults to 48 h. */
  horizonMs?: number;
  /** Hard cap on emitted records. Defaults to 100. */
  maxRecords?: number;
}

const DEFAULT_HORIZON_MS = 48 * 60 * 60 * 1000;
const DEFAULT_MAX_RECORDS = 100;

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function timeToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const match = TIME_RE.exec(hm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isOvernightBlock(start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return false;
  return e <= s;
}

function at(date: string, hm: string, timezone: string): Date | null {
  if (!TIME_RE.test(hm.trim())) return null;
  const [h, m] = hm.split(':');
  const instant = fromZonedTime(`${date}T${h!.padStart(2, '0')}:${m!.padStart(2, '0')}:00.000`, timezone);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** Does a local wall-clock minute fall inside quiet hours (which may wrap midnight)? */
export function isWithinQuietHours(
  minuteOfDay: number,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || s === e) return false;
  if (s < e) return minuteOfDay >= s && minuteOfDay < e;
  // Wraps midnight, e.g. 22:00–07:00.
  return minuteOfDay >= s || minuteOfDay < e;
}

function minuteOfDayInTz(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

interface DraftRecord extends Omit<ScheduledRecord, 'scheduledFor'> {
  scheduledFor: string;
  /** Sleep reminders are exempt from quiet hours: they are *about* the quiet window. */
  sleep?: boolean;
}

function push(
  out: DraftRecord[],
  record: DraftRecord,
  input: BuildLocalScheduleInput,
  horizonEnd: number
): void {
  const { settings } = input;
  const time = record.scheduledTime;
  if (!Number.isFinite(time)) return;
  if (time <= input.now.getTime()) return;
  if (time > horizonEnd) return;

  if (
    !record.sleep &&
    isWithinQuietHours(minuteOfDayInTz(new Date(time), settings.timezone), settings.quietHoursStart, settings.quietHoursEnd)
  ) {
    return;
  }

  out.push(record);
}

/**
 * Derive local notification records from cached days + settings.
 *
 * Deterministic: same inputs → same output, ordered by time. Duplicate ids
 * (two cached snapshots of the same day) collapse to the first occurrence.
 */
export function buildLocalSchedule(input: BuildLocalScheduleInput): ScheduledRecord[] {
  const { settings } = input;
  const horizonMs = input.horizonMs ?? DEFAULT_HORIZON_MS;
  const maxRecords = input.maxRecords ?? DEFAULT_MAX_RECORDS;
  const horizonEnd = input.now.getTime() + horizonMs;
  const out: DraftRecord[] = [];

  // Nothing to schedule when the user has switched notifications off wholesale.
  if (settings.notificationsEnabled === false) return [];

  const advance = settings.upcomingRoutineNotifications !== false ? (settings.advanceNotificationMinutes ?? 0) : 0;

  for (const day of input.days) {
    for (const block of day.blocks) {
      if (block.isRecurring === false) continue;
      if (!block.startTime || !block.endTime) continue;

      const startAt = at(day.date, block.startTime, settings.timezone);
      const endAt = at(day.date, block.endTime, settings.timezone);
      if (!startAt) continue;

      // Overnight blocks end on the following calendar day.
      let end = endAt;
      if (end && isOvernightBlock(block.startTime, block.endTime) && end <= startAt) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      }

      if (advance > 0 && settings.routineStartNotifications !== false) {
        push(
          out,
          {
            id: `local:routine-pre-start:${block.id}:${day.date}`,
            title: `${block.title} starting soon`,
            body: `Your ${block.title} session starts in ${advance} minutes.`,
            url: `/today?block=${block.id}`,
            scheduledTime: startAt.getTime() - advance * 60 * 1000,
            scheduledFor: new Date(startAt.getTime() - advance * 60 * 1000).toISOString(),
            notificationId: null,
            promptId: null,
            tag: `routineos-routine-pre-start-${block.id}-${day.date}`,
            actions: [],
            type: 'ROUTINE_PRE_START',
          },
          input,
          horizonEnd
        );
      }

      if (settings.routineStartNotifications !== false) {
        push(
          out,
          {
            id: `local:routine-start:${block.id}:${day.date}`,
            title: `${block.title} time`,
            body: `Your ${block.title} session starts now.`,
            url: `/today?block=${block.id}`,
            scheduledTime: startAt.getTime(),
            scheduledFor: startAt.toISOString(),
            notificationId: null,
            promptId: null,
            tag: `routineos-routine-start-${block.id}-${day.date}`,
            actions: [],
            type: 'ROUTINE_START',
          },
          input,
          horizonEnd
        );
      }

      if (end && block.trackCompletion !== false) {
        push(
          out,
          {
            id: `local:routine-completion:${block.id}:${day.date}`,
            title: `${block.title} ended`,
            body: `Your scheduled ${block.title} session has ended.`,
            url: `/today?block=${block.id}`,
            scheduledTime: end.getTime(),
            scheduledFor: end.toISOString(),
            notificationId: null,
            promptId: null,
            tag: `routineos-routine-completion-${block.id}-${day.date}`,
            actions: [],
            type: 'ROUTINE_COMPLETION',
          },
          input,
          horizonEnd
        );
      }
    }
  }

  // Sleep reminders — exempt from quiet hours.
  if (settings.sleepPreWarningEnabled && settings.sleepPreWarningTime) {
    for (const day of input.days) {
      const at_ = at(day.date, settings.sleepPreWarningTime, settings.timezone);
      if (!at_) continue;
      push(
        out,
        {
          id: `local:sleep-pre-warning:${day.date}`,
          title: 'Sleep schedule approaching',
          body: 'Your sleep schedule starts soon. Start winding down.',
          url: '/today',
          scheduledTime: at_.getTime(),
          scheduledFor: at_.toISOString(),
          notificationId: null,
          promptId: `sleep-pre-warning:${day.date}`,
          tag: `routineos-sleep-pre-warning-${day.date}`,
          actions: [],
          type: 'SLEEP_PRE_WARNING',
          sleep: true,
        },
        input,
        horizonEnd
      );
    }
  }

  if (settings.sleepReminder !== false && settings.targetBedtime) {
    for (const day of input.days) {
      const at_ = at(day.date, settings.targetBedtime, settings.timezone);
      if (!at_) continue;
      push(
        out,
        {
          id: `local:sleep-prompt:${day.date}`,
          title: 'Time to sleep',
          body: `Your target bedtime is ${settings.targetBedtime}.`,
          url: '/today',
          scheduledTime: at_.getTime(),
          scheduledFor: at_.toISOString(),
          notificationId: null,
          promptId: `sleep-prompt:${day.date}`,
          tag: `routineos-sleep-prompt-${day.date}`,
          actions: [
            { action: 'sleep-start', title: 'Yes, start sleep' },
            { action: 'sleep-dismiss', title: 'Not yet' },
          ],
          type: 'SLEEP_PROMPT',
          sleep: true,
        },
        input,
        horizonEnd
      );
    }
  }

  if (settings.wakeConfirmationEnabled && settings.targetWakeTime) {
    for (const day of input.days) {
      const at_ = at(day.date, settings.targetWakeTime, settings.timezone);
      if (!at_) continue;
      push(
        out,
        {
          id: `local:sleep-wake:${day.date}`,
          title: 'Good morning',
          body: `Your target wake time is ${settings.targetWakeTime}.`,
          url: '/today',
          scheduledTime: at_.getTime(),
          scheduledFor: at_.toISOString(),
          notificationId: null,
          promptId: `sleep-wake-prompt:${day.date}`,
          tag: `routineos-sleep-wake-${day.date}`,
          actions: [
            { action: 'woke-at-target', title: 'Yes' },
            { action: 'woke-later', title: 'Later' },
          ],
          type: 'SLEEP_WAKE_CONFIRMATION',
          sleep: true,
        },
        input,
        horizonEnd
      );
    }
  }

  // Daily check-in (habit reminder umbrella).
  if (settings.dailyReminder && settings.dailyReminderTime) {
    for (const day of input.days) {
      const at_ = at(day.date, settings.dailyReminderTime, settings.timezone);
      if (!at_) continue;
      push(
        out,
        {
          id: `local:habit-daily:${day.date}`,
          title: 'Daily check-in',
          body: "Take a moment to log today's habits and see your daily score.",
          url: '/today',
          scheduledTime: at_.getTime(),
          scheduledFor: at_.toISOString(),
          notificationId: null,
          promptId: null,
          tag: `routineos-habit-daily-${day.date}`,
          actions: [],
          type: 'HABIT_REMINDER',
        },
        input,
        horizonEnd
      );
    }
  }

  // Dedupe by id (two cached snapshots of one day), order by time, cap.
  const seen = new Set<string>();
  const deduped: ScheduledRecord[] = [];
  for (const record of out.sort((a, b) => a.scheduledTime - b.scheduledTime)) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const { sleep: _sleep, ...clean } = record;
    deduped.push(clean);
    if (deduped.length >= maxRecords) break;
  }
  return deduped;
}

/** How many days ahead to fetch and cache. A week covers a normal offline gap. */
const CACHE_HORIZON_DAYS = 7;
const SETTINGS_CACHE_KEY = 'current';

interface ResolvedDayLike {
  date?: string;
  dayType?: string;
  dayTypeName?: string | null;
  blocks?: Array<{
    id?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    isRecurring?: boolean;
    trackCompletion?: boolean;
  }>;
}

/** Coerce a resolved-day API payload into the builder's input, or null. */
export function toScheduleDay(routine: ResolvedDayLike | null | undefined): ScheduleDayInput | null {
  if (!routine || typeof routine.date !== 'string' || !Array.isArray(routine.blocks)) return null;
  const blocks: ScheduleBlockInput[] = [];
  for (const block of routine.blocks) {
    if (!block || typeof block.id !== 'string' || typeof block.title !== 'string') continue;
    if (typeof block.startTime !== 'string' || typeof block.endTime !== 'string') continue;
    blocks.push({
      id: block.id,
      title: block.title,
      startTime: block.startTime,
      endTime: block.endTime,
      isRecurring: block.isRecurring,
      trackCompletion: block.trackCompletion,
    });
  }
  return {
    date: routine.date,
    dayType: typeof routine.dayType === 'string' ? routine.dayType : 'CUSTOM',
    dayTypeName: routine.dayTypeName ?? null,
    blocks,
  };
}

function isoDatePlusDays(base: Date, days: number, timezone: string): string {
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
}

/**
 * Refresh the cached schedule from the server and (re)build the local
 * notification mirror. Best-effort: offline, it simply rebuilds from whatever is
 * already cached.
 *
 * Always fetches **and** builds so the local projection stays current even on a
 * day when the server plan has already been mirrored.
 */
export async function refreshOfflineSchedule(userId: string): Promise<number> {
  if (typeof window === 'undefined' || !userId) return 0;

  const settings = await cacheGet<LocalSchedulerSettings>(userId, 'settings', SETTINGS_CACHE_KEY);
  const timezone = settings?.timezone || 'UTC';
  const now = new Date();

  // 1. Refresh the read cache with the next week of resolved days (when online).
  await fetchAndCacheDays(userId, timezone, now);

  // 2. Build from cache — works whether or not step 1 reached the server.
  const cached = await cacheList<ResolvedDayLike>(userId, 'day');
  const days = cached
    .map((entry) => toScheduleDay(entry.data))
    .filter((day): day is ScheduleDayInput => day !== null);

  if (days.length === 0 || !settings) return 0;

  const records = buildLocalSchedule({ days, settings, now });

  // 3. Merge into the schedule store without clobbering mirrored-server rows or
  //    already-fired local rows, then hand them to the worker.
  const existing = await idbGetAll<ScheduledRecord>(STORE_SCHEDULE).catch(() => []);
  const firedAtById = new Map(existing.map((row) => [row.id, row.firedAt ?? null]));
  for (const record of records) {
    const alreadyFired = firedAtById.get(record.id);
    if (alreadyFired != null) record.firedAt = alreadyFired;
  }

  await idbPutAll(STORE_SCHEDULE, records);
  await postToWorker({ type: 'SCHEDULE_UPSERT', records });
  await registerPeriodicSync();
  return records.length;
}

async function fetchAndCacheDays(userId: string, timezone: string, now: Date): Promise<void> {
  const dates: string[] = [];
  for (let day = 0; day <= CACHE_HORIZON_DAYS; day += 1) {
    dates.push(isoDatePlusDays(now, day, timezone));
  }

  await Promise.all(
    dates.map(async (date) => {
      try {
        const response = await fetch(`/api/routine/today?date=${date}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const json: unknown = await response.json().catch(() => null);
        const routine =
          json && typeof json === 'object' && 'data' in json
            ? (json as { data: ResolvedDayLike }).data
            : null;
        if (routine) await cachePut(userId, 'day', date, routine);
      } catch {
        // Offline or unauthenticated — keep whatever is cached.
      }
    })
  );
}

/** Cache the user's settings so the builder has the gates and times it needs. */
export async function cacheSettingsSnapshot(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const response = await fetch('/api/settings', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const json: unknown = await response.json().catch(() => null);
    const settings =
      json && typeof json === 'object' && 'data' in json
        ? (json as { data: LocalSchedulerSettings }).data
        : null;
    if (settings) await cachePut(userId, 'settings', SETTINGS_CACHE_KEY, settings);
  } catch {
    // Best effort.
  }
}
