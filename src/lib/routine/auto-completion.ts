/**
 * Auto-completion rule — pure.
 *
 * ## What this decides, and what it deliberately does not
 *
 * When a scheduled block's window has fully passed and the user recorded
 * nothing for it, the honest answer is *not* "unknown": the day is over, the
 * block's time is gone, and leaving the row blank is what made a three-block day
 * look identical whether the user did nothing or simply never opened the app.
 * This module decides, for one block, whether that window has passed and what
 * the system may therefore assert about it.
 *
 * It asserts exactly one thing — **MISSED**, with `completionSource`
 * `AUTO_ASSUMED` — and it never asserts **COMPLETED**. The system cannot know
 * that a block happened; it can know that it did not and was not reported. Every
 * other "did this happen" question is left to the user, and any row the user
 * touches becomes `USER_CONFIRMED` (or `MANUAL_EDIT`) and is never overwritten
 * by this rule. That is enforced by the caller (`REconciliationService`) which
 * inserts only when no log row exists, but the *kind* of inference this module
 * is allowed to make is fixed here, in one testable place.
 *
 * ## "Every block", not "only tracked blocks"
 *
 * The user's decision was that **every** ended block with nothing recorded
 * auto-misses, not only those flagged `trackCompletion`. `trackCompletion` is
 * about whether the *progress views* count a block, and a block that silently
 * happened or did not is information regardless of whether it is being tracked
 * for a rate. Untracked blocks therefore auto-miss too, and the score is kept
 * honest by **excluding `AUTO_ASSUMED` rows from `routineCompletionRate`**
 * entirely (see `scoring.service.ts`) rather than by refusing to classify them.
 *
 * ## No clock, no database
 *
 * Everything the rule needs is passed in: the block's times, the date being
 * classified, `now` in the user's own timezone, and the current time as minutes
 * from midnight. This module imports nothing but the timeline helpers, so it can
 * be exercised against every boundary (midnight, overnight blocks, an unlogged
 * tomorrow) with no environment and no `DATABASE_URL`.
 */

import type { RoutineLogStatus, CompletionSource } from '@/generated/prisma';
import { blockEndMinutes, clockToMinutes } from './timeline';
import { MINUTES_PER_DAY } from './conflicts';

/**
 * The block facts the rule reads.
 *
 * Structural, not `ResolvedRoutineBlock`, so a caller may pass a raw
 * `RoutineBlock` row or a resolved block without adapting it. `trackCompletion`
 * is deliberately absent: every block is eligible (see the module note).
 */
export interface AutoClassificationInput {
  startTime: string;
  endTime: string;
}

export interface AutoClassification {
  /** Always `MISSED` today; a union so a future rule can widen it without a rewrite. */
  status: Extract<RoutineLogStatus, 'MISSED'>;
  /** Always `AUTO_ASSUMED` — this is the machine's guess, not the user's answer. */
  completionSource: Extract<CompletionSource, 'AUTO_ASSUMED'>;
  /**
   * Minutes from midnight at which the block finished, in the day's own frame
   * (past 1440 when the block is overnight). Exposed so a caller can stamp an
   * `answeredAt` consistent with the block rather than with the sweep time.
   */
  endedAtMinutes: number;
  /** Human-readable reason, for logging and for the UI tooltip. */
  reason: string;
}

/**
 * Classify one block for one date.
 *
 * Returns `null` — "make no claim" — in every case where asserting MISSED would
 * be wrong or merely presumptuous:
 *
 *  - the block has not ended yet (this is still the future, or the block is
 *    running now),
 *  - the date is **after** today (never pre-miss a day that has not happened),
 *  - the time strings are unparseable, so "has it ended" cannot be answered.
 *
 * ## Past dates are decided against the end of *their own* day, not against now
 *
 * For a date strictly before today, every one of its blocks has ended by
 * construction — the whole day is in the past — so the rule does not need the
 * current clock at all. Passing `nowMinutes: null` for a past date is therefore
 * both correct and required: it means "the whole day is over", and every block
 * classifies as MISSED. This is what makes a backfill (reconcile a 30-day range)
 * a single call per date with no clock arithmetic.
 *
 * `isFutureDate` must be supplied by the caller, because this module has no
 * calendar. A date **equal to** today is not future; the clock then decides per
 * block, which is the only date for which `nowMinutes` is actually needed.
 *
 * @param block        The block's scheduled window.
 * @param options.isFutureDate  True only for a date strictly after today.
 * @param options.nowMinutes    Minutes from midnight *now*, or `null` for a past
 *                              date (whole day over) — see above.
 */
export function classifyBlockCompletion(
  block: AutoClassificationInput,
  options: { isFutureDate?: boolean; nowMinutes: number | null }
): AutoClassification | null {
  if (options.isFutureDate) return null;

  const start = clockToMinutes(block.startTime);
  const end = blockEndMinutes(block.startTime, block.endTime);

  // A past date (null clock) leaves nothing to test; the whole day is over.
  if (options.nowMinutes !== null) {
    // Not ended: either still running, or yet to start today.
    if (options.nowMinutes < end) return null;
  }

  // `blockEndMinutes` returns `end > start ? end : end + 1440`, so an overnight
  // block reports a positive duration and `end > start` holds for it too here.
  const durationMinutes = end - start;

  return {
    status: 'MISSED',
    completionSource: 'AUTO_ASSUMED',
    endedAtMinutes: end,
    reason:
      durationMinutes >= MINUTES_PER_DAY
        ? 'All-day block window passed with no record; treated as missed.'
        : `Block ending ${block.endTime} passed with no record; treated as missed.`,
  };
}

/**
 * Whether a whole date should be reconciled at all.
 *
 * Cheap gate the caller uses to skip future dates in a range walk without
 * re-deriving the comparison per block. Kept here, beside the rule it guards, so
 * "is this date classifiable" has one definition.
 */
export function isReconcilableDate(
  date: string,
  today: string
): boolean {
  // Lexicographic comparison is valid for `YYYY-MM-DD` and avoids constructing
  // a `Date` (and therefore a timezone question) just to compare two strings.
  return date <= today;
}
