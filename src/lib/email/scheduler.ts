/**
 * Email scheduling utilities.
 *
 * Scheduler-aware helpers for building "send at X" emails: normalized due-date
 * windows, a deterministic send-time resolver, and a scheduled-queue model for
 * hourly/minute based digests. All times are UTC.
 */

import type { SendEmailOptions } from './sender';
import { enqueueEmail } from './queue';

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ScheduledEmail {
  id: string;
  /** ISO timestamp of the next send. */
  nextRunAt: string;
  frequency: RepeatFrequency;
  options: SendEmailOptions;
  lastRunAt: string | null;
}

export interface ScheduleEmailInput {
  options: SendEmailOptions;
  /** ISO timestamp of the first send. */
  startAt: string;
  frequency?: RepeatFrequency;
}

/** Compute the next due time after `after` for a frequency. */
export function nextOccurrence(after: Date, frequency: RepeatFrequency): Date {
  switch (frequency) {
    case 'daily':
      return new Date(after.getTime() + MS_PER_DAY);
    case 'weekly':
      return new Date(after.getTime() + 7 * MS_PER_DAY);
    case 'monthly':
      return new Date(
        after.getFullYear(),
        after.getMonth() + 1,
        Math.min(after.getDate(), 28),
        0,
        0,
        0
      );
    case 'none':
    default:
      // A one-shot email has no next run.
      return new Date(0);
  }
}

/**
 * Create a scheduled email entry.
 */
export function scheduleEmail(input: ScheduleEmailInput): ScheduledEmail {
  const frequency = input.frequency ?? 'none';
  const id = `scheduled-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    nextRunAt: new Date(input.startAt).toISOString(),
    frequency,
    options: input.options,
    lastRunAt: null,
  };
}

/**
 * For a "send N hours before deadline" window, return the exact fire time.
 *
 * @example
 * dueWithinHours({ dueAt: '2026-09-20T08:00:00Z', hours: 24 })
 * // => fires 2026-09-19T08:00:00Z
 */
export function dueWithinHours(args: {
  dueAt: string;
  hours: number;
}): { fireAt: Date; fireAtISO: string } {
  const due = new Date(args.dueAt);
  const fireAt = new Date(
    Number.isNaN(due.getTime()) ? Date.now() : due.getTime() - Math.max(0, args.hours) * MS_PER_HOUR
  );
  return { fireAt, fireAtISO: fireAt.toISOString() };
}

/**
 * Run due scheduled emails: enqueues every email whose `nextRunAt` has passed,
 * then advances/evicts that entry based on its frequency. Returns the ids sent.
 */
export async function runScheduledEmails(
  schedules: readonly ScheduledEmail[]
): Promise<{ sent: string[]; next: ScheduledEmail[] }> {
  const now = Date.now();
  const sent: string[] = [];
  const next: ScheduledEmail[] = [];

  for (const scheduled of schedules) {
    const due = new Date(scheduled.nextRunAt).getTime();
    if (due > now) {
      next.push(scheduled);
      continue;
    }

    enqueueEmail(scheduled.options);
    sent.push(scheduled.id);

    if (scheduled.frequency === 'none') {
      // One-shot: drop after firing.
      continue;
    }

    const nextRun = nextOccurrence(new Date(now), scheduled.frequency);
    next.push({
      ...scheduled,
      nextRunAt: nextRun.toISOString(),
      lastRunAt: new Date(now).toISOString(),
    });
  }

  return { sent, next };
}