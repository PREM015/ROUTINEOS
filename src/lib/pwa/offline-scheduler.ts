import { STORE_SCHEDULE, idbGetAll, idbPutAll, idbDelete } from '@/lib/offline/idb';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { fromZonedTime } from 'date-fns-tz';
import type { UserId } from '@/types/ids';

const routineRepository = new RoutineRepository();

/** How far ahead to schedule locally. 48 hours to cover today + tomorrow. */
const LOCAL_HORIZON_MS = 48 * 60 * 60 * 1000;

/** Maximum notifications to keep in local schedule. */
const MAX_LOCAL_SCHEDULED = 100;

const SYNC_TAG = 'routineos-notifications';

export interface LocalScheduledRecord {
  id: string;
  title: string;
  body: string;
  url: string;
  scheduledTime: number;
  scheduledFor: string;
  notificationId: string | null;
  promptId: string | null;
  tag: string;
  actions: Array<{ action: string; title: string }>;
  firedAt?: number | null;
  type?: string | null;
  /** Whether this was generated locally (offline) vs synced from server. */
  isLocal?: boolean;
}

/**
 * Generate tomorrow's notifications locally based on confirmed DayType.
 * This works offline using cached routine templates and user settings.
 */
export async function generateTomorrowNotificationsLocally(
  userId: UserId,
  timezone: string,
  tomorrowDate: string,
  dayTypeId: string | null,
  dayType: string,
  userSettings: any
): Promise<LocalScheduledRecord[]> {
  const now = new Date();
  // The far edge of the local scheduling horizon, as a Date. Written as
  // `horizonEnd` it would be numeric addition on a Date, which does
  // not compile and, if it had, would compare a timestamp against a Date.
  const horizonEnd = new Date(now.getTime() + LOCAL_HORIZON_MS);
  const records: LocalScheduledRecord[] = [];

  try {
    // Get tomorrow's routine template
    let templateId = dayTypeId;
    if (!templateId) {
      const template = await routineRepository.findTemplateByDayType(userId, dayType as any);
      templateId = template?.id ?? null;
    }

    if (!templateId) {
      console.warn('[offline-scheduler] No template for tomorrow');
      return [];
    }

    const template = await routineRepository.findTemplateWithBlocks(templateId, userId);
    if (!template || !template.blocks) {
      return [];
    }

    const advanceMinutes = userSettings?.advanceNotificationMinutes ?? 0;
    const advanceEnabled = userSettings?.upcomingRoutineNotifications !== false;

    // Sleep notifications
    if (userSettings?.sleepPreWarningEnabled) {
      const preWarningTime = userSettings.sleepPreWarningTime || '23:00';
      const preWarningAt = fromZonedTime(
        `${tomorrowDate}T${preWarningTime}:00.000`,
        timezone
      );
      
      if (preWarningAt > now && preWarningAt < horizonEnd) {
        records.push({
          id: `local:sleep-pre-warning:${tomorrowDate}`,
          title: 'Sleep schedule approaching',
          body: `Your sleep schedule starts in 1 hour. Start winding down!`,
          url: '/today',
          scheduledTime: preWarningAt.getTime(),
          scheduledFor: preWarningAt.toISOString(),
          notificationId: null,
          promptId: `sleep-pre-warning:${tomorrowDate}`,
          tag: `routineos-sleep-pre-warning-${tomorrowDate}`,
          actions: [],
          type: 'SLEEP_PRE_WARNING',
          isLocal: true,
        });
      }
    }

    // Sleep prompt at bedtime
    if (userSettings?.targetBedtime) {
      const bedtimeAt = fromZonedTime(
        `${tomorrowDate}T${userSettings.targetBedtime}:00.000`,
        timezone
      );
      
      if (bedtimeAt > now && bedtimeAt < horizonEnd) {
        records.push({
          id: `local:sleep-prompt:${tomorrowDate}`,
          title: 'Time to sleep',
          body: `Your target bedtime is ${userSettings.targetBedtime}. Sleep will start automatically in ${userSettings.sleepAutoStartAfterMinutes || 15} minutes unless you say "Not yet".`,
          url: '/today',
          scheduledTime: bedtimeAt.getTime(),
          scheduledFor: bedtimeAt.toISOString(),
          notificationId: null,
          promptId: `sleep-prompt:${tomorrowDate}`,
          tag: `routineos-sleep-prompt-${tomorrowDate}`,
          actions: [
            { action: 'sleep-start', title: 'Yes, start sleep' },
            { action: 'sleep-dismiss', title: 'Not yet' },
          ],
          type: 'SLEEP_PROMPT',
          isLocal: true,
        });
      }
    }

    // Wake confirmation
    if (userSettings?.wakeConfirmationEnabled && userSettings?.targetWakeTime) {
      const wakeAt = fromZonedTime(
        `${tomorrowDate}T${userSettings.targetWakeTime}:00.000`,
        timezone
      );
      
      if (wakeAt > now && wakeAt < horizonEnd) {
        records.push({
          id: `local:sleep-wake:${tomorrowDate}`,
          title: 'Good morning!',
          body: `Your target wake time is ${userSettings.targetWakeTime}. Did you wake up now?`,
          url: '/today',
          scheduledTime: wakeAt.getTime(),
          scheduledFor: wakeAt.toISOString(),
          notificationId: null,
          promptId: `sleep-wake-prompt:${tomorrowDate}`,
          tag: `routineos-sleep-wake-${tomorrowDate}`,
          actions: [
            { action: 'woke-at-target', title: `Yes, at ${userSettings.targetWakeTime}` },
            { action: 'woke-later', title: 'I woke up later' },
            { action: 'still-sleeping', title: 'Still sleeping' },
          ],
          type: 'SLEEP_WAKE_CONFIRMATION',
          isLocal: true,
        });
      }
    }

    // Routine block notifications
    for (const block of template.blocks) {
      if (!block.isRecurring) continue;

      const startTime = block.startTime;
      const endTime = block.endTime;
      const isOvernight = block.isOvernight || timeToMinutes(endTime) <= timeToMinutes(startTime);

      const startAt = getNextOccurrence(startTime, isOvernight, timezone, tomorrowDate, now);
      if (!startAt) continue;

      const endAt = getEndOccurrence(startTime, endTime, isOvernight, startAt, timezone);
      if (!endAt) continue;

      // Pre-start
      if (advanceEnabled && advanceMinutes > 0) {
        const preStartAt = new Date(startAt.getTime() - advanceMinutes * 60 * 1000);
        if (preStartAt > now && preStartAt < horizonEnd) {
          records.push({
            id: `local:routine-pre-start:${block.id}:${tomorrowDate}`,
            title: `${block.title} starting soon`,
            body: `Your ${block.title} session starts in ${advanceMinutes} minutes. Get ready!`,
            url: `/today?block=${block.id}`,
            scheduledTime: preStartAt.getTime(),
            scheduledFor: preStartAt.toISOString(),
            notificationId: null,
            promptId: null,
            tag: `routineos-routine-pre-start-${block.id}-${tomorrowDate}`,
            actions: [
              { action: 'STARTED', title: 'Started' },
              { action: 'SNOOZE', title: `Snooze 10m` },
            ],
            type: 'ROUTINE_PRE_START',
            isLocal: true,
          });
        }
      }

      // Start
      let startScheduledAt = advanceEnabled && advanceMinutes > 0 
        ? new Date(startAt.getTime() - advanceMinutes * 60 * 1000)
        : startAt;
      
      if (startScheduledAt < now) startScheduledAt = startAt;
      
      if (startScheduledAt < horizonEnd) {
        records.push({
          id: `local:routine-start:${block.id}:${tomorrowDate}`,
          title: `${block.title} Time`,
          body: `Your ${block.title} session starts now.`,
          url: `/today?block=${block.id}`,
          scheduledTime: startScheduledAt.getTime(),
          scheduledFor: startScheduledAt.toISOString(),
          notificationId: null,
          promptId: null,
          tag: `routineos-routine-start-${block.id}-${tomorrowDate}`,
          actions: [
            { action: 'STARTED', title: 'Started' },
            { action: 'NOT_YET', title: 'Not yet' },
            { action: 'SKIP', title: 'Skip' },
          ],
          type: 'ROUTINE_START',
          isLocal: true,
        });
      }

      // Completion
      if (endAt > now && endAt < horizonEnd) {
        records.push({
          id: `local:routine-completion:${block.id}:${tomorrowDate}`,
          title: `${block.title} session ended`,
          body: `Your scheduled ${block.title} session has ended. Did you complete it?`,
          url: `/today?block=${block.id}`,
          scheduledTime: endAt.getTime(),
          scheduledFor: endAt.toISOString(),
          notificationId: null,
          promptId: null,
          tag: `routineos-routine-completion-${block.id}-${tomorrowDate}`,
          actions: [
            { action: 'COMPLETED', title: 'Completed' },
            { action: 'PARTIAL', title: 'Partially done' },
            { action: 'NOT_DONE', title: 'Not done' },
            { action: 'EXTEND', title: 'Extend session' },
          ],
          type: 'ROUTINE_COMPLETION',
          isLocal: true,
        });
      }
    }

    // Habit reminders (simplified - just daily reminder)
    if (userSettings?.dailyReminder && userSettings?.dailyReminderTime) {
      const [hours, minutes] = userSettings.dailyReminderTime.split(':').map(Number);
      const reminderAt = fromZonedTime(
        `${tomorrowDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000`,
        timezone
      );
      
      if (reminderAt > now && reminderAt < horizonEnd) {
        records.push({
          id: `local:habit-daily:${tomorrowDate}`,
          title: 'Daily check-in',
          body: 'Take a moment to log today\'s habits and see your daily score.',
          url: '/today',
          scheduledTime: reminderAt.getTime(),
          scheduledFor: reminderAt.toISOString(),
          notificationId: null,
          promptId: null,
          tag: `routineos-habit-daily-${tomorrowDate}`,
          actions: [],
          type: 'HABIT_REMINDER',
          isLocal: true,
        });
      }
    }

  } catch (error) {
    console.error('[offline-scheduler] Failed to generate tomorrow notifications:', error);
  }

  return records.sort((a, b) => a.scheduledTime - b.scheduledTime).slice(0, MAX_LOCAL_SCHEDULED);
}

/**
 * Get next occurrence of a routine block for a specific date
 */
function getNextOccurrence(
  startTime: string,
  isOvernight: boolean,
  timezone: string,
  targetDate: string,
  now: Date
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const instant = fromZonedTime(
    `${targetDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000`,
    timezone
  );

  if (instant.getTime() > now.getTime() || (isOvernight && instant.getTime() > now.getTime())) {
    return instant;
  }

  return null;
}

/**
 * Calculate end occurrence for a routine block
 */
function getEndOccurrence(
  startTime: string,
  endTime: string,
  isOvernight: boolean,
  startOccurrence: Date,
  timezone: string
): Date | null {
  const startMatch = /^(\d{2}):(\d{2})$/.exec(startTime.trim());
  const endMatch = /^(\d{2}):(\d{2})$/.exec(endTime.trim());
  if (!startMatch || !endMatch) return null;

  const startHours = Number(startMatch[1]);
  const startMinutes = Number(startMatch[2]);
  const endHours = Number(endMatch[1]);
  const endMinutes = Number(endMatch[2]);

  if (startHours > 23 || startMinutes > 59 || endHours > 23 || endMinutes > 59) return null;

  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(startOccurrence);

  let endLocalDate = localDate;
  if (isOvernight) {
    // `split` is index-accessed, so each part is possibly undefined under
    // `noUncheckedIndexedAccess`. A malformed date yields an invalid Date, which
    // the caller's formatting already guards against.
    const [year, month, day] = localDate.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    date.setUTCDate(date.getUTCDate() + 1);
    endLocalDate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  return fromZonedTime(
    `${endLocalDate}T${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00.000`,
    timezone
  );
}

/**
 * Convert HH:mm to minutes
 */
function timeToMinutes(hm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hm.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Sync local schedule to service worker and IndexedDB
 */
export async function syncLocalSchedule(records: LocalScheduledRecord[]): Promise<number> {
  if (typeof window === 'undefined') return 0;

  try {
    // Preserve firedAt for existing entries
    const existing = await idbGetAll<LocalScheduledRecord>(STORE_SCHEDULE).catch(() => []);
    const firedAtById = new Map(existing.map((r) => [r.id, r.firedAt ?? null]));
    
    for (const record of records) {
      const alreadyFired = firedAtById.get(record.id);
      if (alreadyFired != null) record.firedAt = alreadyFired;
    }

    await idbPutAll(STORE_SCHEDULE, records);
    await postToWorker({ type: 'SCHEDULE_UPSERT', records });
    await registerPeriodicSync();
    
    return records.length;
  } catch (error) {
    console.error('[offline-scheduler] Failed to sync local schedule:', error);
    return 0;
  }
}

/**
 * Clear all locally generated notifications
 */
export async function clearLocalSchedule(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const existing = await idbGetAll<LocalScheduledRecord>(STORE_SCHEDULE).catch(() => []);
    const localIds = existing
      .filter(r => r.id.startsWith('local:'))
      .map(r => r.id);
    
    for (const id of localIds) {
      await idbDelete(STORE_SCHEDULE, id);
    }
    
    await postToWorker({ type: 'SCHEDULE_CLEAR', ids: localIds });
  } catch (error) {
    console.error('[offline-scheduler] Failed to clear local schedule:', error);
  }
}

/**
 * Register periodic sync
 */
async function registerPeriodicSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const periodic = registration as ServiceWorkerRegistration & {
      periodicSync?: { register(tag: string): Promise<void> };
    };
    if (!periodic.periodicSync) return false;
    await periodic.periodicSync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send message to service worker
 */
async function postToWorker(message: unknown): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const target = registration.active ?? navigator.serviceWorker.controller;
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}