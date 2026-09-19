/**
 * In-process email queue.
 *
 * A simple FIFO queue with concurrency control and retry. Persistence of
 * pending emails is out of scope: on a crash, unsent jobs are dropped (they
 * are also persisted as `notificationLog`/audit rows by callers when needed).
 */

import { sendEmail } from './sender';
import type { SendEmailOptions, SendEmailResult } from './sender';

export interface QueuedEmail {
  id: string;
  options: SendEmailOptions;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: number;
}

export interface QueueStats {
  pending: number;
  inFlight: number;
  completed: number;
  failed: number;
}

let queue: QueuedEmail[] = [];
let inFlight = 0;
let completed = 0;
let failed = 0;
let processing = false;

/** Backoff delays (ms) between retry attempts. */
const RETRY_DELAYS = [1_000, 5_000, 30_000];
const DEFAULT_MAX_ATTEMPTS = 3;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `email-${Date.now()}-${idCounter}`;
}

/**
 * Enqueue an email for async sending. Returns the generated job id.
 */
export function enqueueEmail(
  options: SendEmailOptions,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS
): string {
  const id = nextId();
  queue.push({
    id,
    options,
    attempts: 0,
    maxAttempts: Math.max(1, Math.floor(maxAttempts)),
    enqueuedAt: Date.now(),
  });
  void drainQueue();
  return id;
}

/**
 * Kick off pending jobs with a hard cap on concurrent sends
 * (`EMAIL_MAX_CONCURRENCY`, default 3).
 */
async function drainQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const maxConcurrency = Math.max(
      1,
      Number(process.env.EMAIL_MAX_CONCURRENCY ?? 3)
    );
    while (queue.length > 0 && inFlight < maxConcurrency) {
      const job = queue.shift();
      if (!job) break;
      inFlight += 1;
      void processJob(job);
    }
  } finally {
    processing = false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(job: QueuedEmail): Promise<void> {
  try {
    const result: SendEmailResult = await sendEmail(job.options);
    if (!result.ok) {
      throw new Error(result.error ?? 'Unknown send error');
    }
    completed += 1;
  } catch {
    job.attempts += 1;
    if (job.attempts >= job.maxAttempts) {
      failed += 1;
      console.error('[routineos:email] job %s failed permanently (%s)', job.id, job.options.to);
    } else {
      const delay =
        RETRY_DELAYS[job.attempts - 1] ??
        RETRY_DELAYS[RETRY_DELAYS.length - 1] ??
        30_000;
      const requeueAt = Date.now() + delay;
      queue.push({
        ...job,
        // Requeue preserving order by descending upcoming fire time.
        enqueuedAt: requeueAt,
      });
      queue.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      setTimeout(() => void drainQueue(), delay);
    }
  } finally {
    inFlight -= 1;
    void drainQueue();
  }
}

/**
 * Snapshot of queue state for dashboards and tests.
 */
export function getEmailQueueStats(): QueueStats {
  return {
    pending: queue.length,
    inFlight,
    completed,
    failed,
  };
}

/**
 * Wait until the queue drains (or the timeout elapses). Test/ops helper.
 */
export async function flushEmailQueue(timeoutMs = 10_000): Promise<QueueStats> {
  const started = Date.now();
  while ((queue.length > 0 || inFlight > 0) && Date.now() - started < timeoutMs) {
    await wait(50);
  }
  return getEmailQueueStats();
}