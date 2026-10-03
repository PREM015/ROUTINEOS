/**
 * Routine Duration Calculations
 * Calculate duration and detect time overlaps
 *
 * Every "HH:mm" string in this module is parsed by
 * {@link timeToMinutesExact} from `./conflicts`, which is also the single
 * source of truth for overlap detection. Nothing here re-implements either.
 */

import {
  MINUTES_PER_DAY,
  timeToMinutesExact,
  timesConflict,
  intervalsFor,
} from './conflicts';

export interface TimeRange {
  startTime: string;
  endTime: string;
}

/** The block shape the clock helpers below read. */
interface ClockBlock {
  id: string;
  startTime: string;
  endTime: string;
}

/** `HH:mm` -> minutes from midnight. Throws on malformed input. */
function minutes(time: string): number {
  return timeToMinutesExact(time);
}

/**
 * `HH:mm` -> minutes from midnight, or `null` if it is not a valid time.
 *
 * Used by the clock helpers below. Those run over **stored** data on every
 * render for `/today` and `/routine`, so one malformed row must not throw and
 * blank the page; such a block is skipped instead. The strict `minutes` is kept
 * for overlap maths and for validation, where a bad time *should* be an error.
 */
function minutesOrNull(time: string): number | null {
  try {
    return timeToMinutesExact(time);
  } catch {
    return null;
  }
}

/**
 * Check if block is overnight (crosses midnight).
 *
 * `end <= start`, so equal times count as overnight: a user who typed the same
 * time twice means "all day"/"all night", and `calculateBlockDuration` agrees
 * by reporting 1440 minutes for it.
 */
export function isOvernightBlock(startTime: string, endTime: string): boolean {
  return minutes(endTime) <= minutes(startTime);
}

/**
 * Calculate block duration in minutes.
 *
 * An overnight block is a positive number of minutes: `22:00` -> `06:00` is
 * 480, not -1320.
 */
export function calculateBlockDuration(startTime: string, endTime: string): number {
  const start = minutes(startTime);
  const end = minutes(endTime);
  return end > start ? end - start : end - start + MINUTES_PER_DAY;
}

/**
 * Format duration in human-readable format.
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) {
    return `${mins}m`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

/**
 * Format minutes-from-midnight as a clock string.
 *
 * `use24h` comes from `UserSettings.timeFormat`; the default is 24h because
 * that is what the stored `HH:mm` values are, and rendering a stored time
 * through `Date.prototype.toLocaleTimeString` in the *browser's* zone is what
 * made a user's schedule shift when they travelled.
 */
export function formatClockMinutes(minutesFromMidnight: number, use24h = true): string {
  const wrapped =
    ((Math.round(minutesFromMidnight) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;

  if (use24h) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  const suffix = hours < 12 ? 'AM' : 'PM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * Check if two time ranges overlap.
 *
 * Delegates to `timesConflict`, which expands an overnight block into the two
 * intervals it actually occupies. The previous inline version here compared a
 * day's-forward end time against a same-day range and reported that a
 * `22:00`->`06:00` block did **not** overlap `01:00`->`02:00`, which it does.
 */
export function isTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return timesConflict(start1, end1, start2, end2);
}

/**
 * Whether `nowMinutes` (minutes from midnight, in the user's own zone) falls
 * inside a block, accounting for a block that started yesterday evening.
 */
export function isNowWithin(startTime: string, endTime: string, nowMinutes: number): boolean {
  try {
    return intervalsFor({ startTime, endTime }).some(
      ([start, end]) => nowMinutes >= start && nowMinutes < end
    );
  } catch {
    return false;
  }
}

/**
 * Get current time block for a specific time
 */
export function getCurrentBlock<T extends ClockBlock>(
  blocks: readonly T[],
  currentTime: string = new Date().toTimeString().slice(0, 5)
): T | null {
  const current = minutesOrNull(currentTime);
  if (current === null) return null;

  for (const block of blocks) {
    if (isNowWithin(block.startTime, block.endTime, current)) {
      return block;
    }
  }

  return null;
}

/**
 * Get next block after current time
 *
 * Returns `null` when nothing else starts later **today**.
 *
 * F7 — this used to fall back to `sortedBlocks[0]`, the day's *earliest* block,
 * under a comment claiming it was "the first block of tomorrow". There is no
 * tomorrow data here, so the fallback actually returned a block that had already
 * finished: with a 09:00–10:00 block current and nothing scheduled later, the
 * dashboard rendered "Next: 06:00 block at 06:00".
 *
 * `null` is the honest answer — "there is no next block today" — and both
 * consumers already handle it: `/today`'s `CurrentRoutineBlock` and the
 * dashboard's `RightNow` each render a "last block of the day" message when
 * `next` is null. The old fallback meant that message was only reachable when
 * the current block happened to *be* the earliest.
 */
export function getNextBlock<T extends ClockBlock>(
  blocks: readonly T[],
  currentTime: string = new Date().toTimeString().slice(0, 5)
): T | null {
  const current = minutesOrNull(currentTime);
  if (current === null) return null;

  let soonest: T | null = null;
  let soonestStart = Number.POSITIVE_INFINITY;

  for (const block of blocks) {
    const start = minutesOrNull(block.startTime);
    // A block with an unparseable time cannot be "next after now", so it is
    // skipped rather than allowed to break the scan.
    if (start !== null && start > current && start < soonestStart) {
      soonest = block;
      soonestStart = start;
    }
  }

  return soonest;
}

/**
 * Calculate time until next block
 */
export function minutesUntilBlock(
  blockStartTime: string,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): number {
  const diff = minutes(blockStartTime) - minutes(currentTime);
  return diff < 0 ? diff + MINUTES_PER_DAY : diff;
}

/**
 * Calculate progress through a block.
 *
 * Before the block's start the elapsed time is 0; after its end it is the full
 * duration. For an overnight block the clock is read past midnight, so at 01:00
 * a `22:00`->`06:00` block reports 180 of 480 minutes rather than a negative
 * number.
 */
export function calculateBlockProgress(
  startTime: string,
  endTime: string,
  currentTime: string = new Date().toTimeString().slice(0, 5)
): { percentage: number; minutesElapsed: number; minutesRemaining: number } {
  const duration = calculateBlockDuration(startTime, endTime);
  const start = minutes(startTime);
  const current = minutes(currentTime);
  const overnight = isOvernightBlock(startTime, endTime);

  // Only an *overnight* block may legitimately have started "yesterday". For a
  // daytime block a negative difference means the block has not started yet, and
  // rolling it forward by a day reported a 09:00 block as 100% complete when the
  // clock read 08:00.
  let elapsed = current - start;
  if (elapsed < 0 && overnight) elapsed += MINUTES_PER_DAY;

  const clamped = Math.min(Math.max(elapsed, 0), duration);
  const percentage = duration > 0 ? (clamped / duration) * 100 : 0;

  return {
    percentage: Math.round(percentage),
    minutesElapsed: clamped,
    minutesRemaining: duration - clamped,
  };
}