/**
 * THE overlap implementation for routine blocks.
 *
 * This file is the single source of truth for "do these two time ranges
 * collide?". It previously had zero importers while `duration.ts` carried a
 * second, subtly broken copy — so there were two answers to the same question
 * and they disagreed.
 *
 * ## Why the naive version is wrong
 *
 * The obvious implementation rolls an overnight block's end time forward by a
 * day and then does the usual `aStart < bEnd && bStart < aEnd`:
 *
 * ```ts
 * // 22:00-06:00, rolled end = 1620
 * isTimeOverlap('22:00', '06:00', '01:00', '02:00')  // => false  (WRONG)
 * ```
 *
 * A sleep block that *contains* 01:00-02:00 does not overlap it, because the
 * comparison is between "22:00 today - 06:00 tomorrow" and "01:00 today -
 * 02:00 today" — two intervals on different days. That is exactly the false
 * negative the naive version produces, and it is the reason every sleep block
 * in the app was reported as conflict-free.
 *
 * ## The fix
 *
 * Expand an overnight block into the two intervals it actually occupies on the
 * calendar day: `[start, 1440)` and `[0, end)`. Comparing the *sets* of
 * intervals is then correct for every combination, and a same-time block
 * (`start === end`) becomes the full 24 hours, which is what a user who typed
 * the same time twice means.
 *
 * `duration.ts isTimeOverlap` now delegates here rather than keeping its own
 * arithmetic, so there is one answer, and it is the right one.
 */

/** The minimum shape needed to reason about a block's occupancy of the day. */
export interface RoutineTimeBlock {
  id?: string;
  /** `HH:mm` */
  startTime: string;
  /** `HH:mm` */
  endTime: string;
  /**
   * Optional stored flag. `RoutineBlock.isOvernight` exists, but the flag is
   * only trustworthy when it agrees with the times, so `end <= start` is
   * treated as authoritative and this is honoured only as a tiebreaker for
   * callers holding blocks that have no reliable times.
   */
  isOvernight?: boolean;
}

/** A half-open `[start, end)` interval in minutes from midnight. */
export type Interval = [number, number];

export const MINUTES_PER_DAY = 1440;

/**
 * Parse `HH:mm` into minutes from midnight.
 *
 * Throws on malformed input rather than silently reading `NaN`. Every other
 * implementation in this repo used `split(':').map(Number)` with defaults,
 * which turns `"9am"` into `9` and `"12:60"` into `720` — an invalid time
 * quietly became a plausible one, and the caller had no way to know.
 */
export function timeToMinutesExact(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(`Time must use HH:mm format, received "${time}".`);
  }
  const [, hours = '0', minutes = '0'] = match;
  return Number(hours) * 60 + Number(minutes);
}

/** Minutes from midnight -> `HH:mm`. `null` when out of range. */
export function minutesToTime(minutes: number): string | null {
  if (!Number.isFinite(minutes)) return null;
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const remainder = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/**
 * The intervals a block occupies on one calendar day.
 *
 * Same-instant blocks (`22:00`-`22:00`) occupy the whole day, matching how a
 * user reads them: "all night", not "zero minutes" and not "never".
 */
export function intervalsFor(block: RoutineTimeBlock): Interval[] {
  const start = timeToMinutesExact(block.startTime);
  const end = timeToMinutesExact(block.endTime);
  if (end > start) return [[start, end]];
  if (start === end) return [[0, MINUTES_PER_DAY]];
  return [
    [start, MINUTES_PER_DAY],
    [0, end],
  ];
}

/**
 * The minutes of `day` two blocks share, or `0` when they do not collide.
 *
 * Returned rather than a boolean because the UI's live "shift to start after
 * it" affordance needs to know *where* the clash ends, and because the timeline
 * wants the size of an overlap to weight it. Overnight expansion means the
 * answer is the sum over interval pairs, clamped to one day — a block fully
 * inside another reports its own length, not twice it.
 */
export function overlapMinutes(left: RoutineTimeBlock, right: RoutineTimeBlock): number {
  if (left.id !== undefined && right.id !== undefined && left.id === right.id) return 0;

  let total = 0;
  for (const [leftStart, leftEnd] of intervalsFor(left)) {
    for (const [rightStart, rightEnd] of intervalsFor(right)) {
      const shared = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
      if (shared > 0) total += shared;
    }
  }
  return Math.min(total, MINUTES_PER_DAY);
}

/** Do two blocks share any minute of the day? */
export function routineBlocksConflict(left: RoutineTimeBlock, right: RoutineTimeBlock): boolean {
  return overlapMinutes(left, right) > 0;
}

/**
 * Every block in `blocks` that collides with `candidate`, excluding itself.
 *
 * The candidate is a *candidate*: it may be a block that does not exist yet, so
 * it is typed by what the comparison actually needs rather than by the full
 * stored row. It is matched by `id` when it has one, so re-saving a block at its
 * current times never reports it as conflicting with itself.
 */
export function conflictsAgainst<T extends RoutineTimeBlock>(
  candidate: RoutineTimeBlock & { title?: string },
  blocks: readonly T[]
): T[] {
  return blocks.filter(
    (block) => block.id !== candidate.id && routineBlocksConflict(candidate, block)
  );
}

/**
 * Same check, with the candidate and the blocks sharing one type.
 *
 * Kept because it reads better at call sites that are comparing two lists of the
 * same shape (the timeline's pairwise pass); delegates to {@link conflictsAgainst}
 * so there is still one implementation.
 */
export function findRoutineConflicts<T extends RoutineTimeBlock>(
  candidate: T,
  blocks: readonly T[]
): T[] {
  return conflictsAgainst(candidate, blocks);
}

/**
 * Convenience wrapper over {@link isTimeOverlap}'s four-string signature.
 *
 * Kept so the existing callers of `duration.ts` do not each have to build an
 * object, and so there is still exactly one place that answers the question.
 */
export function timesConflict(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return routineBlocksConflict(
    { startTime: start1, endTime: end1 },
    { startTime: start2, endTime: end2 }
  );
}