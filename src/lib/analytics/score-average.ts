/**
 * Score averaging and freshness for the analytics hero.
 *
 * ## Why this is not in the service
 *
 * Both functions are pure arithmetic over rows the caller already has. They lived
 * inside `AnalyticsService`, which imports twenty repositories and therefore
 * `@/lib/prisma` — so neither could be reached from a test, and the two bugs they
 * now fix (a hardcoded `daysScored` of 7 for a week and 1 for a month, and a
 * permanently `null` core/growth/bonus on the two longest tabs) were untestable in
 * place and therefore went unfixed.
 *
 * This is the extraction, not a mirror. `lib/habits/contribution-eligibility.ts`
 * exists because reimplementing an eligibility rule in a testable place invites the
 * two copies to drift; there is no rule here to copy, only arithmetic to move. The
 * service imports these functions, so there is exactly one implementation.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import { calendarDaysBetween } from '@/lib/dates';

export interface ScoreAverage {
  average: number | null;
  core: number | null;
  growth: number | null;
  bonus: number | null;
  /** Days in the period that actually carry a score, for "out of N days" phrasing. */
  daysScored: number;
}

/** The `DailyScore` columns this module reads. Structural, so tests need no Prisma row. */
export interface DailyScoreRowLike {
  totalScore: number | null;
  coreScore: number | null;
  growthScore: number | null;
  bonusScore: number | null;
}

export interface ScoreFreshness {
  /** Newest day this user has a score for, anywhere in their history. */
  latestScoredDate: string | null;
  /** Days in the range that have already happened. */
  elapsedDays: number;
  /** Elapsed days in the range carrying no score. */
  unscoredDays: number;
}

function round(value: number, decimals = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Mean of one score column across the rows that have it, or `null` if none do.
 *
 * `null` and not `0`: a component nobody has recorded is unmeasured, and a zero
 * would claim the user scored nothing on it.
 */
function meanScoreColumn(
  rows: DailyScoreRowLike[],
  column: 'coreScore' | 'growthScore' | 'bonusScore'
): number | null {
  const values = rows
    .map((row) => row[column])
    .filter((value): value is number => value !== null && value !== undefined);
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * The headline score for any period, derived one way from one row set.
 *
 * This used to read `day.score.*` for a day, `week.scores.*` for a week, and a
 * hardcoded `null` for a month and a year — so the two longest tabs showed three
 * permanent dashes on exactly the breakdown a user most wants there, while a
 * comment above the function claimed the values had been filled in.
 *
 * The scored-day count was worse than absent. A week reported `7` and a month
 * reported `1` regardless of what was actually scored, and that number is what the
 * "out of N days" phrasing is built from, so a week with three scored days claimed
 * to average seven.
 *
 * Every tab now averages the same columns over the same rows, so the four cannot
 * drift, and a part-scored period reports how many days it really has.
 */
export function buildScoreAverage(rows: DailyScoreRowLike[]): ScoreAverage {
  const scored = rows.filter((row) => row.totalScore !== null);
  if (scored.length === 0) {
    return { average: null, core: null, growth: null, bonus: null, daysScored: 0 };
  }
  return {
    average: round(scored.reduce((sum, row) => sum + (row.totalScore ?? 0), 0) / scored.length),
    core: meanScoreColumn(scored, 'coreScore'),
    growth: meanScoreColumn(scored, 'growthScore'),
    bonus: meanScoreColumn(scored, 'bonusScore'),
    daysScored: scored.length,
  };
}

/**
 * How far behind the scores are, so the page can say so.
 *
 * `compute-daily-scores` is a bounded nightly job (200 rows, 90-day lookback), so a
 * period can legitimately contain days nobody has computed yet. Without this the
 * page averages whatever exists and presents it as the period's score, which is how
 * a month missing its last four days reads as a decline.
 *
 * Only *elapsed* days count. A day in the future has not been missed.
 *
 * ## When the chip stays hidden
 *
 * A period containing no score at all is an *absence of data*, not a lag, and it is
 * reported by a different mechanism. Two very common periods land here:
 *
 *  - **Today, before the job has run.** The cron fires at 01:00, so the current day
 *    legitimately has no score for most of every day. The hero already says "No
 *    score recorded for this period" over a dashed ring; a warning chip on the
 *    default tab, every morning, would be noise about the normal case.
 *  - **A period that predates the account.** Those days will never be computed, so
 *    warning about them would put the chip on every historical period a user
 *    browses back to, reading as a permanent outage.
 *
 * The test for "does this period have data at all" is whether the newest score
 * falls inside it — not whether any day is scored, which the two cases above also
 * fail. Both bounds are needed: a score from *after* the period says nothing about
 * it, so a range check that only tested `>= range.start` would put the chip on every
 * historical period the user has scored since. The chip is only for the case it can
 * actually explain: the job has demonstrably worked within this period and
 * something in it is still behind.
 *
 * `unscoredDays` is clamped at zero: a `daysScored` above `elapsedDays` means the
 * score rows and the range disagree (a retroactive edit, a timezone shift), and
 * "-3 days not scored" is not a sentence anyone should read.
 */
export function buildFreshness(
  range: { start: string; end: string },
  userToday: string,
  latestScoredDate: string | null,
  daysScored: number
): ScoreFreshness {
  const hasScoreInPeriod =
    latestScoredDate !== null &&
    latestScoredDate >= range.start &&
    latestScoredDate <= range.end;
  if (range.start > userToday || !hasScoreInPeriod) {
    return { latestScoredDate, elapsedDays: 0, unscoredDays: 0 };
  }
  const elapsedEnd = range.end < userToday ? range.end : userToday;
  const elapsedDays = calendarDaysBetween(range.start, elapsedEnd) + 1;
  return {
    latestScoredDate,
    elapsedDays,
    unscoredDays: Math.max(0, elapsedDays - daysScored),
  };
}
