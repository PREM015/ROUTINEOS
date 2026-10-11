/**
 * Spaced repetition for DSA problems.
 *
 * Pure and interval-table-based. Pure because the schedule is arithmetic on a
 * date, and because the rule is worth being able to test without a database or
 * a clock — "a problem solved today comes back in one day, then three" is a
 * claim that should be pinned by a test rather than observed in production.
 */

/**
 * Interval in days, indexed by how many times a problem has been reviewed.
 *
 * The shape matters more than the numbers: expanding (never shrink) so a
 * problem that was easy stays out of the way, and a hard one keeps coming back.
 * The values follow a light SM-2 shape — 1, 3, 7, 16, 35 — short enough to be
 * useful for interview prep, which is measured in weeks rather than years.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;

/** After the table is exhausted, keep doubling. */
const MAX_INTERVAL_DAYS = 180;

/**
 * When a problem should next be reviewed.
 *
 * `reviewCount` is how many times it has already been reviewed *before* this
 * one, so the first review schedules `INTERVALS[0]` (tomorrow).
 *
 * `from` is injected rather than read from the clock so the result is
 * deterministic and testable.
 */
export function nextReviewDate(
  reviewCount: number,
  from: Date = new Date()
): Date {
  const index = Math.max(0, reviewCount);

  if (index >= REVIEW_INTERVALS_DAYS.length) {
    // Past the table, expand from the last entry by doubling per overflow step.
    const overflow = index - REVIEW_INTERVALS_DAYS.length + 1;
    const last = REVIEW_INTERVALS_DAYS[REVIEW_INTERVALS_DAYS.length - 1] ?? 35;
    const scaled = last * Math.pow(2, overflow);
    return addDays(from, Math.min(scaled, MAX_INTERVAL_DAYS));
  }

  return addDays(from, REVIEW_INTERVALS_DAYS[index] ?? 1);
}

/** The interval that `nextReviewDate` will use, in days. Exposed for the UI. */
export function reviewIntervalDays(reviewCount: number): number {
  const index = Math.max(0, reviewCount);
  if (index >= REVIEW_INTERVALS_DAYS.length) {
    const overflow = index - REVIEW_INTERVALS_DAYS.length + 1;
    const last = REVIEW_INTERVALS_DAYS[REVIEW_INTERVALS_DAYS.length - 1] ?? 35;
    return Math.min(last * Math.pow(2, overflow), MAX_INTERVAL_DAYS);
  }
  return REVIEW_INTERVALS_DAYS[index] ?? 1;
}

function addDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** YYYY-MM-DD for a `Date`, in UTC. Used to compare against a stored date string. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}