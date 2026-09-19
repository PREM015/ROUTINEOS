/**
 * Export scheduling helpers.
 *
 * Model weekly/monthly export runs as pure time logic: when an export is next
 * due, the window to cover, and the retention of old export files. No
 * timers or side effects; callers (cron/API) drive actual execution.
 */

import { cleanupOldBackups, listBackups } from '@/lib/db/backup';
import type { BackupFileInfo } from '@/lib/db/backup';

export type ExportFrequency = 'weekly' | 'monthly';

export interface ExportSchedule {
  frequency: ExportFrequency;
  /** Day-of-week (weekly, 0=Sunday) or day-of-month (monthly, 1-28). */
  anchor: number;
  /** Retain this many generated export files. */
  retention: number;
}

export interface ExportRunInfo {
  nextRunAt: string;
  coversStart: string | null;
  coversEnd: string | null;
  dueNow: boolean;
  lastRunAt: string | null;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Anchor day defaults: Monday for weekly, the 1st for monthly. */
export const DEFAULT_SCHEDULE: ExportSchedule = {
  frequency: 'weekly',
  anchor: 1,
  retention: 12,
};

/**
 * Compute the next run time for a schedule given `now` and an optional
 * `lastRunAt`. Weekly anchors roll to the nearest upcoming `anchor`
 * (0=Sunday..6=Saturday); monthly anchors clamp to 1-28.
 */
export function nextExportTime(
  schedule: ExportSchedule,
  now: Date,
  lastRunAt: Date | null
): Date {
  const next =
    schedule.frequency === 'weekly'
      ? nextWeekly(now, schedule.anchor)
      : nextMonthly(now, schedule.anchor);

  if (lastRunAt && next.getTime() <= lastRunAt.getTime()) {
    const plus =
      schedule.frequency === 'weekly' ? MS_PER_WEEK : 28 * MS_PER_DAY;
    return new Date(lastRunAt.getTime() + plus);
  }
  return next;
}

function nextWeekly(now: Date, anchor: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0..6
  let diff = (anchor - day + 7) % 7;
  if (diff === 0) diff = 7; // at anchor day → next week
  return new Date(d.getTime() + diff * MS_PER_DAY);
}

function nextMonthly(now: Date, anchor: number): Date {
  const day = Math.min(Math.max(1, anchor), 28);
  const candidate = new Date(now.getFullYear(), now.getMonth(), day);
  if (candidate.getTime() <= now.getTime()) {
    return new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return candidate;
}

/** Inclusive date window (YYYY-MM-DD) the next run should cover. */
export function exportWindow(
  frequency: ExportFrequency,
  lastRunAt: Date | null,
  now: Date
): { start: string; end: string } {
  const end = new Date(now);
  let start: Date;
  if (lastRunAt) {
    start = new Date(lastRunAt);
  } else if (frequency === 'weekly') {
    start = new Date(now.getTime() - 7 * MS_PER_DAY);
  } else {
    start = new Date(now.getTime() - 30 * MS_PER_DAY);
  }
  return { start: toISODate(start), end: toISODate(end) };
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Render the schedule as a ready-to-report object.
 */
export function getNextExportRun(
  schedule: ExportSchedule = DEFAULT_SCHEDULE,
  now: Date = new Date(),
  lastRunAt?: string | null
): ExportRunInfo {
  const last = lastRunAt ? new Date(lastRunAt) : null;
  const nextRun = nextExportTime(schedule, now, last);
  const window = exportWindow(schedule.frequency, last, now);
  return {
    nextRunAt: nextRun.toISOString(),
    coversStart: window.start,
    coversEnd: window.end,
    dueNow: now.getTime() >= nextRun.getTime(),
    lastRunAt,
  };
}

/**
 * Retain the `retention` newest export files under `directory`, deleting older
 * ones. Thin wrapper over `cleanupOldBackups` (backup files and export files
 * share the same file-based retention model).
 */
export async function retainRecentExports(
  retention: number,
  directory?: string
): Promise<{ removed: number; remaining: BackupFileInfo[] }> {
  const before = await listBackups(directory);
  const removedCount = await cleanupOldBackups(Math.max(0, retention), directory);
  const remaining = await listBackups(directory);
  return { removed: removedCount, remaining };
}