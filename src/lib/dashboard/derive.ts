import type { DayType } from '@/generated/prisma';
import { shiftCalendarDay } from '@/lib/dates';
import { ENUM_TO_SLUG } from '@/constants/routine';
// From `day-type`, NOT `resolve-routine`: that module imports `RoutineRepository`
// and therefore `@/lib/prisma`, which throws at import time without a
// DATABASE_URL. Importing the pure rule from there is what previously made this
// file untestable.
import { resolveDayTypeFromException } from '@/lib/scheduling/day-type';
import type { DashboardDayTypeBucket } from '@/types/dashboard';

/**
 * Pure derivations behind `/dashboard`.
 *
 * These were originally private functions inside
 * `DashboardOverviewService`, which made them untestable - the repo's Vitest
 * config runs in a `node` environment with no database, so anything behind a
 * repository is unreachable from a test. Splitting them here follows the
 * pattern `lib/routine/duration.ts` already sets: pure rule, service composes it.
 */

/**
 * How far a goal may trail its linear pace line and still count as "on pace".
 *
 * Ten percentage points of a multi-week goal is roughly a day of drift, which is
 * within the noise of a goal someone updates weekly rather than daily.
 */
export const GOAL_PACE_TOLERANCE_PCT_POINTS = 10;

/**
 * Fraction of a goal's period that has already elapsed, as 0-100.
 *
 * Both bounds are clamped because a goal whose period has not started yet has
 * `elapsed = 0` (not negative), and one whose `endDate` has passed is fully
 * elapsed even though the raw ratio overshoots. Either way an unclamped value
 * would make `behind` negative and count a finished-but-unfinished goal as ahead
 * of pace - which is the exact bug the previous `GoalsMetric` had.
 */
export function elapsedPercent(start: string, end: string, asOf: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const total = endMs - startMs;
  if (total <= 0) return 100;
  return clampPercent(((asOfMs - startMs) / total) * 100);
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** The subset of `Goal` this needs, so tests do not need a full Prisma row. */
export interface PaceGoal {
  id: string;
  title: string;
  status: string;
  targetValue: number;
  currentValue: number;
  /** Calendar date `YYYY-MM-dd` in the user's timezone. */
  startDate: string;
  endDate: string;
}

export interface GoalPace {
  active: number;
  onPace: number;
  /** The same on-pace count computed as if `today` were 7 days earlier. */
  previousOnPace: number;
  furthestBehind: {
    id: string;
    title: string;
    /** Percentage points below the linear pace line. Always >= 1. */
    behindPctPoints: number;
  } | null;
}

/**
 * "On pace" = progress has kept up with the fraction of the goal's own period
 * that has elapsed, within `GOAL_PACE_TOLERANCE_PCT_POINTS`.
 *
 * ## Why this replaced a threshold
 *
 * The old `GoalsMetric` compared progress against a flat 40%-or-15% cut-off
 * chosen from days remaining. Three things were wrong with it:
 *
 *  - The threshold moved as the deadline approached without any progress being
 *    logged, so a goal could flip from "on track" to "not on track" purely
 *    because time passed.
 *  - Two goals with identical progress landed on opposite sides of it purely
 *    because their deadlines differed.
 *  - It was a percentage of the target, not of the elapsed period, so a goal 90%
 *    complete one day from its deadline read as "not on track".
 *
 * Comparing against a pace line is the definition the label "on pace" actually
 * claims, and it is stable: holding progress still while the deadline approaches
 * correctly *does* mean falling behind.
 */
export function goalPace(
  goals: readonly PaceGoal[],
  today: string,
  tolerance = GOAL_PACE_TOLERANCE_PCT_POINTS
): GoalPace {
  const weekAgo = shiftCalendarDay(today, -7);

  const active = goals.filter((g) => g.status === 'ACTIVE' || g.status === 'CARRIED_OVER');

  let onPace = 0;
  let previousOnPace = 0;
  let worst: { goal: PaceGoal; behind: number } | null = null;

  for (const goal of active) {
    // `targetValue <= 0` would divide by zero; treat it as "not started" rather
    // than as infinitely ahead or infinitely behind.
    const progress =
      goal.targetValue > 0 ? clampPercent((goal.currentValue / goal.targetValue) * 100) : 0;

    const behindNow = elapsedPercent(goal.startDate, goal.endDate, today) - progress;
    const behindThen = elapsedPercent(goal.startDate, goal.endDate, weekAgo) - progress;

    if (behindNow <= tolerance) onPace += 1;
    if (behindThen <= tolerance) previousOnPace += 1;

    if (behindNow > tolerance && (!worst || behindNow > worst.behind)) {
      worst = { goal, behind: behindNow };
    }
  }

  return {
    active: active.length,
    onPace,
    previousOnPace,
    furthestBehind: worst
      ? {
          id: worst.goal.id,
          title: worst.goal.title,
          // Never below 1: "0 points behind pace" would read as a rounding
          // artefact rather than as the fact it is.
          behindPctPoints: Math.max(1, Math.round(worst.behind)),
        }
      : null,
  };
}

/** Mean of the non-null entries, or `null` when there are none. */
export function meanOfPresent(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export interface DayTypeDefinitionLike {
  id: string;
  slug: string;
  name: string;
}

export interface DayTypeExceptionLike {
  date: string;
  dayTypeId: string | null;
  dayType: DayType;
}

/**
 * Average score per day type.
 *
 * Two things this deliberately does not do:
 *
 *  - It does not call `resolveDayTypeForDate` per day. That is 2 queries x 30.
 *    `resolveDayTypeFromException` is the same rule made pure and synchronous
 *    precisely so a caller that bulk-loads can apply it without a round trip.
 *  - It does not drop low-sample types. Filtering is the widget's job, via
 *    `scoredDays`, because "hide it" is a presentation decision and this is the
 *    data layer.
 */
export function bucketByDayType(
  days: { date: string; totalScore: number | null }[],
  definitions: DayTypeDefinitionLike[],
  exceptions: DayTypeExceptionLike[]
): DashboardDayTypeBucket[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const bySlug = new Map(definitions.map((d) => [d.slug, d]));
  const exceptionByDate = new Map(exceptions.map((e) => [e.date, e]));

  const sums = new Map<string, { total: number; count: number }>();

  for (const day of days) {
    if (day.totalScore === null) continue;

    const exception = exceptionByDate.get(day.date) ?? null;
    const definition = exception?.dayTypeId ? byId.get(exception.dayTypeId) : undefined;

    const resolved = resolveDayTypeFromException(
      day.date,
      'UTC',
      exception ? { dayType: exception.dayType, dayTypeId: exception.dayTypeId } : null,
      definition ? { id: definition.id, name: definition.name } : null
    );

    // The natural branch returns a null `dayTypeName`, so it is filled in from
    // the user's own definition for that slug. Falling back to the enum keeps
    // the bar labelled for a user who deleted their day types.
    const name =
      resolved.dayTypeName ??
      bySlug.get(ENUM_TO_SLUG[resolved.dayType] ?? '')?.name ??
      resolved.dayType;

    const bucket = sums.get(name) ?? { total: 0, count: 0 };
    bucket.total += day.totalScore;
    bucket.count += 1;
    sums.set(name, bucket);
  }

  return Array.from(sums.entries())
    .map(([dayTypeName, { total, count }]) => ({
      dayTypeName,
      averageScore: Math.round(total / count),
      scoredDays: count,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}
