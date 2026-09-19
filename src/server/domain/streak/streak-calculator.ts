/**
 * Streak Calculator – pure streak math over sets of active dates.
 * Currently the only streak logic (the DB-backed lib/streaks path is
 * repository-coupled and intentionally not reused here). No DB access.
 */

import { THRESHOLDS } from '@/config/scoring';

const MS_PER_DAY = 86_400_000;

// ============================================================================
// Constants & types
// ============================================================================

/** Milestone lengths at which a streak qualifies for a badge. */
export const STREAK_MILESTONES: number[] = [...THRESHOLDS.streakMilestones];

export interface StreakOptions {
  /** Dates (YYYY-MM-DD) that count toward the streak (e.g. rest dates). */
  restDates?: ReadonlySet<string>;
  /** If false, rest dates break the streak. Defaults to true. */
  restCountsInStreak?: boolean;
  /** Grace days allowed before a streak is considered broken. Defaults to 0. */
  graceDays?: number;
}

// ============================================================================
// Helpers
// ============================================================================

function toMs(dateStr: string): number {
  const [y = '1970', m = '1', d = '1'] = dateStr.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function addDays(dateStr: string, days: number): string {
  return new Date(toMs(dateStr) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function previousDay(dateStr: string): string {
  return addDays(dateStr, -1);
}

function nextDayAfter(dateStr: string): string {
  return addDays(dateStr, 1);
}

/** Distinct dates sorted ascending. */
function normalizeDates(dates: string[]): string[] {
  return [...new Set(dates)].sort((a, b) => toMs(a) - toMs(b));
}

// ============================================================================
// Current streak
// ============================================================================

/**
 * Length of the current run of consecutive date activity ending at/around
 * `today`. Non-active dates break the streak unless they are rest dates
 * (with `restCountsInStreak`).
 * @example
 * calculateCurrentStreak(['2026-09-15', '2026-09-16', '2026-09-17'], '2026-09-18')
 * // => 3 (today not yet logged does not break the streak)
 */
export function calculateCurrentStreak(
  dates: string[],
  today: string,
  options: StreakOptions = {},
): number {
  const {
    restDates = new Set<string>(),
    restCountsInStreak = true,
    graceDays = 0,
  } = options;

  const active = normalizeDates(dates);
  const activeSet = new Set(active);

  const isActive = (d: string): boolean =>
    activeSet.has(d) || (restCountsInStreak && restDates.has(d));

  let current = 0;
  let cursor = today;

  // Allow the streak to start from "today" even without a log today.
  for (let dayCursor = cursor, slack = graceDays; ; dayCursor = previousDay(dayCursor)) {
    if (isActive(dayCursor)) {
      current += 1;
      continue;
    }
    if (slack > 0) {
      slack -= 1;
      continue; // a missed day within the grace window
    }
    break;
  }

  // If today hasn't been logged yet but the previous day was active, `current`
  // already counts that previous run; otherwise the loop above yields 0.
  return current;
}

// ============================================================================
// Longest streak
// ============================================================================

/**
 * Longest consecutive run of activity within the supplied dates.
 * @example
 * calculateLongestStreak(['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-06'])
 * // => 2
 */
export function calculateLongestStreak(
  dates: string[],
  options: Pick<StreakOptions, 'restDates' | 'restCountsInStreak'> = {},
): number {
  const {
    restDates = new Set<string>(),
    restCountsInStreak = true,
  } = options;

  const active = normalizeDates(dates);
  if (active.length === 0) return 0;

  const activeSet = new Set(active);
  const isActive = (d: string): boolean =>
    activeSet.has(d) || (restCountsInStreak && restDates.has(d));

  let longest = 0;
  let run = 0;
  let prev = active[0];

  for (const d of active) {
    if (prev && d === nextDayAfter(prev)) {
      run += 1;
    } else {
      run = 1;
    }
    // Rest dates do not extend numeric reach of a run; they only preserve it.
    const stretches = isActive(d) || (restCountsInStreak && restDates.has(d));
    if (stretches && run > longest) longest = run;
    prev = d;
  }

  return longest;
}

export { calculateLongestStreak as calculateBestStreak };

// ============================================================================
// Milestones
// ============================================================================

/**
 * Highest milestone achieved at or below the given streak length, or null.
 * @example
 * streakMilestone(14) // => 14
 * streakMilestone(11) // => 7
 */
export function streakMilestone(
  streakDays: number,
  milestones: number[] = STREAK_MILESTONES,
): number | null {
  const reached = milestones
    .filter((m) => streakDays >= m)
    .sort((a, b) => b - a);
  return reached[0] ?? null;
}

/**
 * Next milestone above a current streak length.
 * @example
 * nextStreakMilestone(20) // => 21
 */
export function nextStreakMilestone(
  streakDays: number,
  milestones: number[] = STREAK_MILESTONES,
): number | null {
  const next = milestones
    .filter((m) => m > streakDays)
    .sort((a, b) => a - b);
  return next[0] ?? null;
}

/**
 * Days remaining until the next milestone.
 * @example
 * daysUntilMilestone(20) // => 1 (next milestone 21)
 */
export function daysUntilMilestone(
  streakDays: number,
  milestones: number[] = STREAK_MILESTONES,
): number | null {
  const next = nextStreakMilestone(streakDays, milestones);
  return next === null ? null : next - streakDays;
}

// ============================================================================
// Broken detection
// ============================================================================

/**
 * Whether the current streak is broken given the last active date.
 * Grace days allow a streak to survive short gaps.
 * @example
 * isStreakBroken('2026-09-15', '2026-09-18', 0) // => true
 * isStreakBroken('2026-09-15', '2026-09-18', 3) // => false
 */
export function isStreakBroken(
  lastActiveDate: string | null,
  today: string,
  graceDays = 0,
): boolean {
  if (lastActiveDate === null) return true;
  const gap = Math.round((toMs(today) - toMs(lastActiveDate)) / MS_PER_DAY) - 1;
  return gap > graceDays;
}