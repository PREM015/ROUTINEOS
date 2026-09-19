/**
 * Time Blocks – pure scheduling math over a day represented in minutes
 * (0 = 00:00 .. 1440 = 24:00). Used for availability / busy detection and
 * free-slot finding. No DB access.
 */

import { timeToMinutes } from '@/lib/dates';

// ============================================================================
// Types
// ============================================================================

/** A slot of time defined in minutes-from-midnight. */
export interface TimeSlot {
  start: number;
  end: number;
}

/** A time range given in HH:mm strings. */
export interface ClockRange {
  startTime: string;
  endTime: string;
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert an HH:mm string into minutes-from-midnight.
 * @example
 * blockToMinutes('06:30') // => 390
 */
export function blockToMinutes(time: string): number {
  return timeToMinutes(time);
}

/**
 * Format minutes-from-midnight into an HH:mm clock string.
 * @example
 * minutesToClock(390) // => '06:30'
 */
export function minutesToClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ============================================================================
// Daily load & busy checks
// ============================================================================

/**
 * Total minutes a block occupies (handles overnight ranges).
 * @example
 * dayLoad([{ start: 360, end: 420 }]) // => 60
 */
export function dayLoad(blocks: TimeSlot[]): number {
  return blocks.reduce((sum, b) => sum + Math.max(0, b.end - b.start), 0);
}

/** Union of busy minutes across all blocks (no double-count of overlaps). */
export function busyMinutes(blocks: TimeSlot[]): number {
  const busy = new Set<number>();
  for (const b of blocks) {
    for (let m = b.start; m < b.end; m += 1) {
      busy.add(m);
    }
  }
  return busy.size;
}

/** Whether any minute of `slot` overlaps existing blocks. */
export function isBusy(blocks: TimeSlot[], slot: TimeSlot): boolean {
  return blocks.some((b) => slot.start < b.end && b.start < slot.end);
}

/**
 * Whether a block of `durationMinutes` fits inside an existing free window
 * starting at `start`.
 * @example
 * canFitBlock(startOfFreeWindow, freeWindowEnd, 30) // true/false
 */
export function canFitBlock(
  slot: TimeSlot,
  durationMinutes: number,
  bufferMinutes = 0,
): boolean {
  const needed = durationMinutes + bufferMinutes;
  return slot.end - slot.start >= needed;
}

// ============================================================================
// Free slots
// ============================================================================

/**
 * Gaps between busy blocks within `[dayStart, dayEnd]`.
 * @example
 * getFreeSlots([{ start: 360, end: 420 }], 0, 1440)
 * // => [{ start: 0, end: 360 }, { start: 420, end: 1440 }]
 */
export function getFreeSlots(
  blocks: TimeSlot[],
  dayStart = 0,
  dayEnd = 24 * 60,
): TimeSlot[] {
  const sorted = sortBlocks(blocks);
  const free: TimeSlot[] = [];
  let cursor = Math.max(0, dayStart);

  for (const b of sorted) {
    const clamped = {
      start: Math.max(cursor, b.start),
      end: Math.min(dayEnd, b.end),
    };
    if (clamped.start > cursor) {
      free.push({ start: cursor, end: Math.min(dayEnd, clamped.start) });
    }
    cursor = Math.max(cursor, clamped.end);
  }

  if (cursor < dayEnd) {
    free.push({ start: cursor, end: dayEnd });
  }

  return free.filter((s) => s.end > s.start);
}

/**
 * The earliest free slot at-or-after `fromMinutes` that can fit
 * `durationMinutes` plus optional buffer.
 * @example
 * findNextFreeSlot([{ start: 360, end: 420 }], 120, 60)
 * // => { start: 420, end: 480 } (60-min block placed right after busy)
 */
export function findNextFreeSlot(
  blocks: TimeSlot[],
  durationMinutes: number,
  fromMinutes = 0,
  bufferMinutes = 0,
  dayEnd = 24 * 60,
): TimeSlot | null {
  const needed = durationMinutes + bufferMinutes;
  const free = getFreeSlots(blocks, fromMinutes, dayEnd);
  for (const slot of free) {
    if (slot.end - slot.start >= needed) {
      return { start: slot.start, end: slot.start + durationMinutes };
    }
  }
  return null;
}

// ============================================================================
// Sort & normalization
// ============================================================================

/** Sort blocks ascending by start minute. */
export function sortBlocks(blocks: TimeSlot[]): TimeSlot[] {
  return [...blocks]
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
}

/** Normalize an HH:mm pair into TimeSlot minutes; overnight folds into 1440. */
export function rangeToSlot(range: ClockRange): TimeSlot {
  const start = timeToMinutes(range.startTime);
  let end = timeToMinutes(range.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}