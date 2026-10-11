/**
 * How a habit's progress is compared against *its own* target.
 *
 * The single rule set for "is this habit done today". Pure, and deliberately
 * importing no repository and no Prisma client, so it is usable from a server
 * service, from a `'use client'` component and from a unit test with no
 * `DATABASE_URL`.
 *
 * ## Why this is not `quantity >= targetCount` inline
 *
 * Three separate concerns used to be collapsed into one integer comparison:
 *
 *  1. **Direction.** "Do 8000 steps" and "stay under 200 min of screen time" are
 *     both numeric, but they succeed in opposite directions. Only the second one
 *     should be penalised by a high number.
 *  2. **Tracking type.** A BOOLEAN habit has no number at all, so there is
 *     nothing to compare and a `>=` against `null` silently degrades to a tick.
 *  3. **Per-user isolation.** The target is read from the *habit row being
 *     evaluated*, which is always already scoped to one user. There is no
 *     global target anywhere in this file, and no path by which one user's
 *     `targetValue` could be read while evaluating another's log.
 *
 * ## Snapshot precedence
 *
 * A historical log is judged by the target that was in force **when it was
 * written** (`log.targetSnapshot`), never by the habit's current `targetValue`.
 * Raising a target from 8k to 15k must not retroactively turn three months of
 * completed days into misses. When the snapshot is absent — every log written
 * before the column existed — the current target is the best available answer
 * and is used as a fallback.
 */

import type {
  HabitDirection,
  HabitTrackingType,
} from '@/constants/prisma-enums';

/** The minimum of a habit this module needs to judge one log. */
export interface CompletableHabit {
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  /** `null` for a BOOLEAN habit, or a habit whose target is simply unset. */
  targetValue: number | null;
}

/** One day's record for a habit. */
export interface CompletableLog {
  status: string;
  quantity: number | null;
  /**
   * The target in force when this row was written. `null` means "written before
   * snapshots existed", which falls back to the habit's current target.
   */
  targetSnapshot?: number | null;
}

export interface CompletionVerdict {
  /** True when the day's record satisfies the habit's own rule. */
  completed: boolean;
  /**
   * Human-readable reason, surfaced in the UI so a number that does not add up
   * is explained rather than just shown as unchecked.
   */
  reason: string;
}

/**
 * Smallest target we accept.
 *
 * Not zero: `0` makes "reach at least zero of this" true on an empty day, which
 * is never what anyone means. Small values like `30` are legitimate (30 minutes
 * of reading, 30 push-ups) and are explicitly allowed.
 */
export const MIN_TARGET_VALUE = 0.01;

/**
 * Whether a target is a usable, finite, strictly positive number.
 *
 * Rejects `NaN`, `Infinity` and `-1`. Shared by the completion rules and by the
 * Zod validation so the UI and the calculator can never disagree about what a
 * legal target is.
 */
export function isValidTarget(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * The target that governs `log`, honouring the snapshot.
 *
 * Exported because the history views need to render "12400 / 8000 steps" for a
 * day in March without quietly substituting today's 15000.
 */
export function effectiveTarget(habit: CompletableHabit, log: CompletableLog): number | null {
  if (log.targetSnapshot !== null && log.targetSnapshot !== undefined) {
    return log.targetSnapshot;
  }
  return habit.targetValue;
}

/**
 * Does `quantity` satisfy the habit's direction?
 *
 * Split out from `evaluateCompletion` so the quick-entry UI can colour a number
 * as soon as it is typed, without also deciding what a `SKIPPED` row means.
 *
 * A missing quantity never counts as a pass. `LIMIT` in particular must not
 * treat "not recorded" as "under the limit": a day with no reading is unknown,
 * not compliant. That is the same distinction the contribution heatmap draws
 * between a miss and `NO_RECORD`.
 */
export function quantityMeetsTarget(
  direction: HabitDirection,
  target: number | null,
  quantity: number | null
): boolean {
  if (quantity === null || !Number.isFinite(quantity)) return false;
  if (direction === 'AVOID') return false; // AVOID reads no number; handled by the caller.
  if (target === null || !Number.isFinite(target)) return true; // No target set: any value passes.

  return direction === 'LIMIT' ? quantity <= target : quantity >= target;
}

/**
 * The authoritative "is this habit done for this day" rule.
 *
 * Statuses that describe a decision rather than a measurement are returned
 * verbatim and never re-judged: a deliberate `SKIPPED` or `NOT_APPLICABLE` is
 * not a failure and must not be turned into one.
 *
 * The three outcomes:
 *
 *  - **BOOLEAN** — the status is the answer. There is no number to compare.
 *  - **BUILD** — `quantity >= target`. Under the target is not a completion.
 *  - **LIMIT**  — `quantity <= target`. Over the target is a non-completion,
 *    which is the entire point of a limit habit.
 *  - **AVOID**  — success means the user did *not* do it. A recorded quantity
 *    or duration means the thing happened, so it is a failure regardless of how
 *    small the number is; the absence of one is the success.
 */
export function evaluateCompletion(
  habit: CompletableHabit,
  log: CompletableLog
): CompletionVerdict {
  if (log.status === 'COMPLETED') {
    return { completed: true, reason: 'Marked complete' };
  }
  if (log.status === 'SKIPPED') {
    return { completed: false, reason: 'Skipped' };
  }
  if (log.status === 'NOT_APPLICABLE') {
    return { completed: false, reason: 'Not applicable' };
  }

  if (habit.trackingType === 'BOOLEAN') {
    return {
      completed: false,
      reason: 'Not completed',
    };
  }

  const target = effectiveTarget(habit, log);

  if (habit.direction === 'AVOID') {
    // `null` is the point: "no reading" is the win condition. `MISSED` means the
    // user recorded that they did do it.
    if (log.quantity === null) {
      return { completed: true, reason: 'Avoided' };
    }
    return {
      completed: false,
      reason: `Recorded ${log.quantity} - this is meant to be avoided`,
    };
  }

  if (log.quantity === null) {
    return { completed: false, reason: 'No reading recorded' };
  }

  const ok = quantityMeetsTarget(habit.direction, target, log.quantity);
  if (ok) {
    return {
      completed: true,
      reason: target === null ? 'Recorded' : `${log.quantity} of ${target}`,
    };
  }

  return {
    completed: false,
    reason:
      habit.direction === 'LIMIT'
        ? `${log.quantity} exceeds the limit of ${target}`
        : `${log.quantity} of ${target}`,
  };
}

/**
 * Derive the log status from a raw reading, so the caller does not have to
 * re-implement the comparison.
 *
 * Returns `PARTIAL` — not `MISSED` — when the day has a reading that does not
 * meet the target. `MISSED` means "the day was recorded and not done", and a
 * half-finished 4000 steps is genuinely partial; conflating the two is what
 * makes contribution rates read pessimistically.
 *
 * A `null` reading on a BOOLEAN habit means the user simply has not ticked it,
 * which is *unknown*, not a miss. The caller decides what to do with `null`
 * status; this function returns `null` for that case rather than inventing a
 * row.
 */
export function statusFromReading(
  habit: CompletableHabit,
  quantity: number | null
): 'COMPLETED' | 'PARTIAL' | null {
  if (habit.trackingType === 'BOOLEAN') return null;

  if (habit.direction === 'AVOID') {
    if (quantity === null) return 'COMPLETED';
    return 'PARTIAL';
  }

  if (quantity === null) return null;

  return quantityMeetsTarget(habit.direction, habit.targetValue, quantity)
    ? 'COMPLETED'
    : 'PARTIAL';
}

/**
 * Default unit for a tracking type, used when the user gives a number but no
 * unit. `null` for BOOLEAN because there is nothing to measure.
 */
export function defaultUnitFor(
  trackingType: HabitTrackingType
): string | null {
  switch (trackingType) {
    case 'DURATION':
      return 'min';
    case 'COUNT':
      return null;
    default:
      return null;
  }
}
