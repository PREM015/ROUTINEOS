import { shiftCalendarDay } from '@/lib/dates';
import {
  isEligibleOn,
  type ContributionHabit,
  type EligibilityContext,
} from '@/lib/habits/contribution-eligibility';
import type { HabitTier } from '@/generated/prisma';

/**
 * One habit-completion definition for every reporting period.
 *
 * ## The problem this replaces
 *
 * `/analytics` had four different denominators for the same tile:
 *
 * | Period | Numerator | Denominator |
 * | --- | --- | --- |
 * | day | completed | every ACTIVE habit, including never-opened ones |
 * | week | completed | logged rows, minus SKIPPED / NOT_APPLICABLE |
 * | month | completed | logged rows, minus SKIPPED / NOT_APPLICABLE |
 * | year | completed | **every** logged row, skips included |
 *
 * So the week rate ignored days the user never opened the app (a habit with no
 * rows was excluded from the average entirely), the day rate punished them for
 * it, and the year rate counted a deliberate SKIP as a failure. Switching between
 * tabs produced numbers that disagreed with each other, which is the exact
 * failure mode `AGENTS.md` records for this codebase.
 *
 * ## The rule
 *
 * This is the **third** definition the repo already has — the eligibility /
 * scheduled rate used by the contribution heatmap — applied to a period range
 * instead of a year. It is not a fourth:
 *
 *   rate = completed / scheduled
 *
 *   `scheduled`  days in the window where `isEligibleOn(habit, date, ctx)` holds:
 *                not archived, not paused, inside its start/end bounds, no skip /
 *                pause / not-applicable override, day type matches, and the
 *                frequency rule says it was due (a RESCHEDULE override counts).
 *   `completed`  COMPLETED logs, counted **only** on days the habit was actually
 *                due, so a retroactive tick cannot push a rate above 100%.
 *
 * `rate` is `number | null`, never `0` for "nothing happened". Nothing due and
 * nothing done are different claims, and the tile has to be able to say so.
 *
 * ## Future days are not scored
 *
 * `windowEnd` is clipped to `today`. "This week" is Mon–Sun, but on a Thursday the
 * user cannot yet have failed Friday. Counting those days in the denominator made
 * the current week read several points lower than an equivalent completed week,
 * which made the live period the worst-looking one on the page.
 *
 * ## Known consequence of reusing the rule
 *
 * `isEligibleOn` reads the habit's *current* `status`, so a habit paused today is
 * retroactively ineligible for days it was genuinely due earlier in the window.
 * That is the behaviour the pinned contribution rule already has, and diverging
 * from it here would be the fourth definition this module exists to prevent.
 */

/** One calendar day of the window, with everything that was due that day. */
export interface PeriodHabitDay {
  date: string;
  /** Habits due, after the eligibility rule. */
  scheduled: number;
  completed: number;
  missed: number;
  skipped: number;
  /** Due with nothing recorded at all. Unknown, not failed. */
  noRecord: number;
  /** Ids of the habits due that day. */
  scheduledHabitIds: string[];
  completedHabitIds: string[];
  /** Habit ids that were due and have a log row of any status. */
  recordedHabitIds: string[];
}

export interface PeriodHabitRow {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  completed: number;
  missed: number;
  skipped: number;
  /** Times the habit was eligible in the window. */
  scheduled: number;
  /** `completed / scheduled`, or `null` when it was never due. */
  rate: number | null;
  /** The habit's own cached streak, as of now. */
  streakCount: number;
}

export interface PeriodTierRow {
  tier: HabitTier;
  /** Habits in this tier, including ones that were never due. */
  count: number;
  completed: number;
  missed: number;
  skipped: number;
  scheduled: number;
  /** Pooled `completed / scheduled`, or `null`. */
  rate: number | null;
}

export interface PeriodHabitModel {
  perHabit: PeriodHabitRow[];
  byTier: PeriodTierRow[];
  /**
   * Habit counts per tier, over **ACTIVE** habits only.
   *
   * Derived from the same `Habit` rows the rates are computed from, so the tier
   * mix and the tier completion rates always describe the same set. It previously
   * came from a second `habitRepository.findAll` in the service, which could
   * disagree with the rate denominator whenever a habit was paused or archived
   * between the two reads.
   */
  activeTierMix: Array<{ tier: HabitTier; count: number }>;
  /** Dense, one entry per scored date in the window, ascending. */
  days: PeriodHabitDay[];
  /**
   * Raw log status per `${habitId}|${date}`, for surfaces that need to say what
   * a habit's row actually said rather than only whether it counts.
   *
   * A `Map` rather than an array because this never leaves the server: the daily
   * view needs O(1) per habit, and serialising 365 x N entries to send to a
   * browser that only wants one day would be absurd.
   */
  logStatuses: Map<string, string>;
  totals: { completed: number; scheduled: number; rate: number | null };
  /** Days with at least one habit due. */
  scheduledDays: number;
  /** Days that were due and recorded nothing at all. */
  noRecordDays: number;
  /** Days fully completed: everything due was done. */
  fullDays: number;
}

/**
 * The model for a window with nothing in it.
 *
 * Used for a period that has not started yet (the URL can carry a future anchor
 * even though the arrows cannot reach one) and for an account with no habits.
 * `totals.rate` is `null`, which is what makes "nothing due" render as absent
 * rather than as 0%.
 */
export function emptyPeriodHabits(): PeriodHabitModel {
  return {
    perHabit: [],
    byTier: [],
    activeTierMix: [],
    days: [],
    logStatuses: new Map(),
    totals: { completed: 0, scheduled: 0, rate: null },
    scheduledDays: 0,
    noRecordDays: 0,
    fullDays: 0,
  };
}

export interface BuildPeriodHabitsInput {
  /** Inclusive window start, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive window end, `YYYY-MM-DD`, already clipped to today. */
  end: string;
  habits: ContributionHabit[];
  logs: Array<{ habitId: string; date: string; status: string }>;
  ctx: EligibilityContext;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function rate(completed: number, scheduled: number): number | null {
  return scheduled > 0 ? round((completed / scheduled) * 100) : null;
}

export function buildPeriodHabits(input: BuildPeriodHabitsInput): PeriodHabitModel {
  const { start, end, habits, logs, ctx } = input;

  // A `HabitLog` is unique on (userId, habitId, date), so indexing by that pair
  // is exact and makes the per-day lookup O(1) instead of a scan per cell.
  const logByKey = new Map<string, { status: string }>();
  for (const log of logs) {
    if (log.date < start || log.date > end) continue;
    logByKey.set(`${log.habitId}|${log.date}`, { status: log.status });
  }
  const logStatuses = new Map<string, string>();
  for (const [key, value] of logByKey) logStatuses.set(key, value.status);

  interface Accumulator {
    completed: number;
    missed: number;
    skipped: number;
    scheduled: number;
    count: number;
  }
  const perHabit = new Map<string, Accumulator>();
  const perTier = new Map<HabitTier, Accumulator>();
  for (const habit of habits) {
    perHabit.set(habit.id, {
      completed: 0,
      missed: 0,
      skipped: 0,
      scheduled: 0,
      count: 1,
    });
    const tier = perTier.get(habit.tier) ?? {
      completed: 0,
      missed: 0,
      skipped: 0,
      scheduled: 0,
      count: 0,
    };
    tier.count += 1;
    perTier.set(habit.tier, tier);
  }

  const days: PeriodHabitDay[] = [];

  for (let date = start; date <= end; date = shiftCalendarDay(date, 1)) {
    const scheduledHabitIds: string[] = [];
    const completedHabitIds: string[] = [];
    const recordedHabitIds: string[] = [];
    let completed = 0;
    let missed = 0;
    let skipped = 0;

    for (const habit of habits) {
      if (!isEligibleOn(habit, date, ctx).eligible) continue;

      scheduledHabitIds.push(habit.id);
      const habitStats = perHabit.get(habit.id);
      const tierStats = perTier.get(habit.tier);
      if (habitStats) habitStats.scheduled += 1;
      if (tierStats) tierStats.scheduled += 1;

      const log = logByKey.get(`${habit.id}|${date}`);
      if (!log) continue;

      recordedHabitIds.push(habit.id);
      if (log.status === 'COMPLETED') {
        completed += 1;
        if (habitStats) habitStats.completed += 1;
        if (tierStats) tierStats.completed += 1;
        completedHabitIds.push(habit.id);
      } else if (log.status === 'MISSED') {
        missed += 1;
        if (habitStats) habitStats.missed += 1;
        if (tierStats) tierStats.missed += 1;
      } else if (log.status === 'SKIPPED') {
        skipped += 1;
        if (habitStats) habitStats.skipped += 1;
        if (tierStats) tierStats.skipped += 1;
      }
    }

    days.push({
      date,
      scheduled: scheduledHabitIds.length,
      completed,
      missed,
      skipped,
      noRecord: Math.max(0, scheduledHabitIds.length - recordedHabitIds.length),
      scheduledHabitIds,
      completedHabitIds,
      recordedHabitIds,
    });
  }

  const habitRows: PeriodHabitRow[] = habits.map((habit) => {
    const stats = perHabit.get(habit.id) ?? {
      completed: 0,
      missed: 0,
      skipped: 0,
      scheduled: 0,
      count: 0,
    };
    return {
      habitId: habit.id,
      habitName: habit.name,
      tier: habit.tier,
      completed: stats.completed,
      missed: stats.missed,
      skipped: stats.skipped,
      scheduled: stats.scheduled,
      rate: rate(stats.completed, stats.scheduled),
      streakCount: habit.streakCount,
    };
  });

  // Highest rate first; habits that were never due sink to the bottom rather than
  // being dropped, because "I did not have this one due" is itself information.
  habitRows.sort(
    (a, b) =>
      (b.rate ?? -1) - (a.rate ?? -1) ||
      b.completed - a.completed ||
      a.habitName.localeCompare(b.habitName)
  );

  const byTier: PeriodTierRow[] = Array.from(perTier.entries()).map(([tier, stats]) => ({
    tier,
    count: stats.count,
    completed: stats.completed,
    missed: stats.missed,
    skipped: stats.skipped,
    scheduled: stats.scheduled,
    rate: rate(stats.completed, stats.scheduled),
  }));
  byTier.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  const activeTierCounts = new Map<HabitTier, number>();
  for (const habit of habits) {
    if (habit.status !== 'ACTIVE') continue;
    activeTierCounts.set(habit.tier, (activeTierCounts.get(habit.tier) ?? 0) + 1);
  }
  const activeTierMix = Array.from(activeTierCounts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count);

  const scheduledTotal = days.reduce((sum, day) => sum + day.scheduled, 0);
  const completedTotal = days.reduce((sum, day) => sum + day.completed, 0);

  return {
    perHabit: habitRows,
    byTier,
    activeTierMix,
    days,
    logStatuses,
    totals: {
      completed: completedTotal,
      scheduled: scheduledTotal,
      rate: rate(completedTotal, scheduledTotal),
    },
    scheduledDays: days.filter((day) => day.scheduled > 0).length,
    noRecordDays: days.filter((day) => day.noRecord > 0).length,
    fullDays: days.filter((day) => day.scheduled > 0 && day.completed >= day.scheduled).length,
  };
}