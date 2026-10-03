/**
 * Focus metrics — the single glossary.
 *
 * ## Why this file exists
 *
 * The audit found **four** different definitions of "focus minutes" coexisting,
 * each with a different denominator and a different timezone assumption:
 *
 *   1. `getStats`      — completed ∧ duration-present, bucketed on `startedAt`
 *   2. `recap.service` — the same predicate, filtered in JS, no clamp
 *   3. `pattern.service` — completed only, **any title**, counting rows not minutes
 *   4. `FocusStats.tsx` — `actualDuration ?? planned`, **browser-local** day, 100-row cap
 *
 * So `/focus/session` and `/analytics` could legitimately disagree about the same
 * day, and every one of them counted 5-minute breaks as focus work. Four
 * definitions is not a bug to fix one at a time; it is a missing shared module.
 *
 * ## The definitions
 *
 * Every consumer reads these. Nothing computes a focus number any other way.
 *
 * | Term | Definition |
 * | --- | --- |
 * | **Focus session** | A row of type `FOCUS` or `STOPWATCH`. Breaks never count. |
 * | **Completed session** | Ended with `endReason = COMPLETED`. *Only* this one. |
 * | **Partial session** | Ended early, with at least `minimumCountedMinutes`. |
 * | **Focus minutes** | Completed minutes + qualifying partials. |
 * | **Completion rate** | Completed ÷ started, over sessions long enough to judge. |
 * | **Focus day** | A day reaching `streakDayMinutes`. Drives the streak. |
 *
 * ## The two judgement calls, stated
 *
 * **Partial sessions count above a floor.** A user who runs four pomodoros and
 * stops a fifth at 22 minutes did 122 minutes of work, and hiding 22 of them
 * because the session was incomplete would make the headline number wrong in the
 * direction that flatters. The floor is 5 minutes: below that a session is a
 * mis-click or a thought, not an attempt, and counting it would let a user inflate
 * a streak by starting and stopping repeatedly. It is kept in *history* either way.
 *
 * **Completion rate divides by started, not by completed.** The old shape had no
 * completion rate at all, which is why nothing caught the break contamination
 * sooner. With it in place, a change to how sessions are classified becomes
 * visible immediately rather than as a slow drift nobody attributes.
 */

import type { FocusSessionEndReason, FocusSessionType } from '@/constants/prisma-enums';
import { countsAsFocusTime } from '@/lib/focus/type-backfill';
import { attributeMinutes, labelFor } from '@/lib/focus/day-split';

export const FOCUS_METRIC_DEFAULTS = {
  /**
   * A partial shorter than this is not an attempt.
   *
   * Five minutes is a quarter of a classic pomodoro. Below it, the signal is
   * indistinguishable from someone tapping Start to see what happens, and letting
   * those count would mean a streak could be manufactured by starting and stopping
   * twenty times.
   */
  minimumCountedMinutes: 5,
  /**
   * Minutes that make a day count for the streak.
   *
   * Above `minimumCountedMinutes` on purpose. A streak of "days where you opened the
   * timer" is not a streak of anything.
   */
  streakDayMinutes: 25,
  /** Fallback when the user has not set a daily target. */
  dailyTargetMinutes: 120,
} as const;

/**
 * The one row shape every function here accepts.
 *
 * Deliberately narrow — five columns and a rating. A statistics function that
 * accepts the whole Prisma model will start reading fields that do not affect the
 * answer, and then quietly become a second definition.
 */
export interface FocusMetricRow {
  id: string;
  type: FocusSessionType;
  startedAt: Date;
  /** Terminal timestamp: whichever of completed/aborted was written. */
  endedAt: Date | null;
  endReason: FocusSessionEndReason | null;
  actualDuration: number | null;
  /** The session's snapshotted zone; null for pre-migration rows. */
  timezone?: string | null;
}

// =============================================================================
// Classification
// =============================================================================

/** A focus session is FOCUS or STOPWATCH. Breaks are the absence of work. */
export function isFocusSession(row: { type: FocusSessionType }): boolean {
  return countsAsFocusTime(row.type);
}

/**
 * A completed session is one the user saw through.
 *
 * Keyed on `endReason`, **not** on `completedAt != null`. Three reasons this is
 * not the same test: a `MANUAL` entry sets `completedAt`; a recovered session sets
 * it; and the `abortedAt` backfill sets `completedAt` on rows that were never
 * finished. Any of those would inflate the completion rate to 100%, which is the
 * same failure mode as the break contamination, one level up.
 */
export function isCompletedSession(row: { endReason: FocusSessionEndReason | null }): boolean {
  return row.endReason === 'COMPLETED';
}

/**
 * True when the session ran long enough to be worth counting at all.
 *
 * Applies the floor to *partials only*. A completed session counts even at 1
 * minute, because the user was there for the whole thing they planned.
 *
 * An unknown end reason counts **nothing**, and that is not an oversight. The
 * fallback structure here makes it easy to get wrong: without an explicit guard, a
 * row with `endReason === null` falls through to the partial branch and a 20-minute
 * in-progress or ambiguous session is credited as finished work. That was a real bug
 * — `tests/lib/focus-counting-rule.test.ts` exists because it shipped once — and it
 * would have inflated `/api/focus/stats` for every session currently running.
 */
export function countsTowardTotals(
  row: Pick<FocusMetricRow, 'type' | 'endReason' | 'actualDuration'>,
  minimum: number = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes
): boolean {
  if (!isFocusSession(row)) return false;
  const minutes = row.actualDuration ?? 0;

  if (isCompletedSession(row)) return minutes > 0;

  // Every other *known* terminal reason is a partial; `null` is "we do not know",
  // and unknown is never counted as work.
  if (row.endReason === null) return false;

  return minutes >= minimum;
}

/**
 * Minutes a row contributes to the headline totals. Zero when it contributes none.
 *
 * One function, so "does this count" and "how much does it count" cannot disagree —
 * which is how a floor on one path and not the other produces totals that do not
 * add up.
 */
export function countedMinutes(
  row: FocusMetricRow,
  // Explicitly `number`, not left to inference. `FOCUS_METRIC_DEFAULTS` is `as
  // const`, so an inferred default would narrow this parameter to the literal type
  // `5` and reject every caller that passes a configured floor.
  minimum: number = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes
): number {
  if (!countsTowardTotals(row, minimum)) return 0;
  return Math.max(0, row.actualDuration ?? 0);
}

// =============================================================================
// Daily buckets, with minutes split at local midnight
// =============================================================================

export interface FocusDayTotals {
  /** `YYYY-MM-DD` in the session's own zone. */
  date: string;
  /** Headline minutes for the day. */
  minutes: number;
  completedSessions: number;
  partialSessions: number;
}

export interface BucketsInput {
  rows: FocusMetricRow[];
  /** The user's current zone, for rows with no snapshot. */
  timezone: string;
  from: string;
  to: string;
  minimumCountedMinutes?: number;
  streakDayMinutes?: number;
}

/**
 * Per-day totals, splitting a session's minutes across the midnight it crosses.
 *
 * Bucketing uses the session's **snapshotted** zone where one exists. Moving
 * timezone must not silently re-bucket history: someone who worked 09:00–12:00 in
 * Tokyo and then moved to Berlin still did morning work, and re-bucketing it would
 * quietly rewrite what they recorded.
 */
export function bucketByDay(input: BucketsInput): Map<string, FocusDayTotals> {
  const {
    rows,
    timezone,
    from,
    to,
    minimumCountedMinutes = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes,
  } = input;

  const out = new Map<string, FocusDayTotals>();

  const ensure = (date: string): FocusDayTotals => {
    let bucket = out.get(date);
    if (!bucket) {
      bucket = { date, minutes: 0, completedSessions: 0, partialSessions: 0 };
      out.set(date, bucket);
    }
    return bucket;
  };

  for (const row of rows) {
    const minutes = countedMinutes(row, minimumCountedMinutes);
    if (minutes === 0) continue;

    const zone = row.timezone ?? timezone;
    const split = attributeMinutes({
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      actualMinutes: minutes,
      timezone: zone,
    });

    const startDate = split.find((part) => part.isStartDay)?.date ?? labelFor(row.startedAt, zone);
    const startBucket = ensure(startDate);
    if (isCompletedSession(row)) startBucket.completedSessions += 1;
    else startBucket.partialSessions += 1;

    for (const part of split) {
      if (part.date < from || part.date > to) continue;
      ensure(part.date).minutes += part.minutes;
    }
  }

  return out;
}

/**
 * The current streak of focus days.
 *
 * Walks back from today. Today not yet qualifying does **not** break a streak
 * built through yesterday — it is not yet evidence of anything, and penalising it
 * would mean the number drops every morning and recovers at midnight, which reads
 * as a bug to everyone watching it.
 */
export function streakOfFocusDays(
  buckets: ReadonlyMap<string, FocusDayTotals>,
  today: string,
  thresholdMinutes: number
): number {
  let cursor = (buckets.get(today)?.minutes ?? 0) >= thresholdMinutes ? today : previousDay(today);
  let streak = 0;
  // Bounded so a corrupt bucket map cannot spin here.
  for (let guard = 0; guard < 4000; guard += 1) {
    if ((buckets.get(cursor)?.minutes ?? 0) < thresholdMinutes) break;
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

/**
 * Completion rate in `[0, 1]`, or `null` when there is nothing to judge.
 *
 * `null` rather than `0` is deliberate: "you have not completed anything yet" and
 * "you completed nothing" are different facts, and rendering them identically is
 * how a new user is shown a 0% rate before they have done anything wrong.
 *
 * The denominator counts sessions long enough to have been completable, which is
 * why the minimum is applied here too — a 30-second abandon is not a failure.
 */
export function completionRate(
  rows: FocusMetricRow[],
  minimum: number = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes
): number | null {
  let completed = 0;
  let started = 0;
  for (const row of rows) {
    if (!isFocusSession(row)) continue;
    const minutes = row.actualDuration ?? 0;
    if (minutes < minimum) continue;
    started += 1;
    if (isCompletedSession(row)) completed += 1;
  }
  if (started === 0) return null;
  return completed / started;
}

/**
 * Progress against a daily target, clamped to `[0, 1]` plus the raw figures.
 *
 * Clamped for the ring; the unclamped minutes are returned alongside so a "128% of
 * target" message is possible, which is more motivating than a full ring.
 */
export function dailyProgress(
  buckets: ReadonlyMap<string, FocusDayTotals>,
  date: string,
  targetMinutes: number
): { minutes: number; targetMinutes: number; fraction: number; reached: boolean } {
  const minutes = Math.round(buckets.get(date)?.minutes ?? 0);
  const safeTarget = targetMinutes > 0 ? targetMinutes : FOCUS_METRIC_DEFAULTS.dailyTargetMinutes;
  return {
    minutes,
    targetMinutes: safeTarget,
    fraction: Math.min(1, minutes / safeTarget),
    reached: minutes >= safeTarget,
  };
}

/** Average minutes per counted session. Zero when nothing counts. */
export function averageSessionMinutes(rows: FocusMetricRow[], minimum: number = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes): number {
  const counted = rows.map((row) => countedMinutes(row, minimum)).filter((m) => m > 0);
  if (counted.length === 0) return 0;
  const total = counted.reduce((sum, m) => sum + m, 0);
  return Math.round(total / counted.length);
}

/** `YYYY-MM-DD`, one calendar day earlier, as pure string arithmetic. */
function previousDay(date: string): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}
