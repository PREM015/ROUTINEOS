import type { DailyScore, HabitTier, SleepLog } from '@/generated/prisma';
import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_CONFIG } from '@/config/app';
import { getWeekRange } from '@/lib/dates';
import type { WeekStartsOn } from '@/lib/period-range';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { loadPeriodHabits } from '@/server/analytics/period-habits';
import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange } from '@/types/analytics';
import type { UserId } from '@/types/ids';

/**
 * Weekly Analytics
 * Aggregated weekly summary with score, habit, sleep, goal, and streak data.
 */

const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();
const goalRepository = new GoalRepository();
const streakRepository = new StreakRepository();

export interface WeeklyHabitPerformance {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  completed: number;
  missed: number;
  skipped: number;
  /** Days the habit was actually due in the week. */
  scheduled: number;
  /** `completed / scheduled`, or `null` when the habit was never due. */
  completionRate: number | null;
}

export interface WeeklySummary {
  period: DateRange;
  scores: {
    average: number;
    bestDay: { date: string; score: number } | null;
    worstDay: { date: string; score: number } | null;
    perfectDays: number;
    excellentDays: number;
    averageCore: number | null;
    averageGrowth: number | null;
    averageBonus: number | null;
  };
  habits: {
    activeCount: number;
    /** `null` when nothing was due all week, so an empty week is not 0%. */
    averageCompletionRate: number | null;
    mostCompleted: WeeklyHabitPerformance | null;
    mostMissed: WeeklyHabitPerformance | null;
    perHabit: WeeklyHabitPerformance[];
  };
  sleep: {
    loggedDays: number;
    averageDuration: number;
    averageQuality: number | null;
    nightsMeetingTarget: number;
    daysFeltRested: number;
  };
  trend: {
    previousWeek: DateRange;
    previousAverage: number;
    delta: number;
  };
  goals: {
    completed: number;
    progressDelta: number;
  };
  streaks: {
    current: number;
    longest: number;
  };
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Narrow a raw SleepLog to the analyzer's expected shape.
 */
function toSleepLogLike(log: SleepLog): SleepLogLike {
  return {
    date: log.date,
    actualBedtime: log.actualBedtime ?? '00:00',
    actualWakeTime: log.actualWakeTime ?? '00:00',
    quality: log.quality,
  };
}

/**
 * The seven days of the week containing `dateStr`, honouring the user's setting.
 *
 * This used to be open-coded here as ISO-Monday arithmetic — `getUTCDay() === 0 ?
 * 7 : getUTCDay()` then an offset — which pinned every weekly report in the app
 * to Monday while `UserSettings.weekStartsOn` sat unused and writable. It now
 * delegates to `getWeekRange`, so there is one implementation of where a week
 * begins and it takes the user's weekday.
 */
function weekRange(dateStr: string, weekStartsOn: WeekStartsOn): DateRange {
  const { start, end } = getWeekRange(dateStr, weekStartsOn);
  return { startDate: start, endDate: end };
}

/**
 * Net change across every goal's progress during the week.
 *
 * One range query for the whole user, grouped by goal in memory. The previous
 * version called `getProgressHistory(goalId, 100)` per goal — one round trip each,
 * pulling up to 100 rows to keep the handful inside one week.
 *
 * `GoalProgress.date` is a `DateTime`, so each row is bucketed into a calendar day
 * **in the user's timezone** before being compared to the week bounds. Passing
 * strings here, or bucketing in UTC, moves a late-evening check-in into the
 * neighbouring week for every user not on UTC — and the old per-goal version was
 * careful about this, so a bulk rewrite that dropped it would be a regression
 * dressed as an optimisation.
 *
 * A goal with no in-week rows contributes nothing, which is the same `0` the old
 * per-goal version returned for it.
 */
function groupProgressDelta(
  rows: Array<{ goalId: string; date: Date; value: number }>,
  range: DateRange,
  timezone: string
): Map<string, number> {
  const first = new Map<string, number>();
  const last = new Map<string, number>();

  for (const row of rows) {
    const day = formatInTimeZone(row.date, timezone, 'yyyy-MM-dd');
    if (day < range.startDate || day > range.endDate) continue;
    if (!first.has(row.goalId)) first.set(row.goalId, row.value);
    last.set(row.goalId, row.value);
  }

  const deltas = new Map<string, number>();
  for (const [goalId, firstValue] of first) {
    deltas.set(goalId, (last.get(goalId) ?? firstValue) - firstValue);
  }
  return deltas;
}

/**
 * Weekly summary for the week containing `weekStart`.
 *
 * `weekStartsOn` is required rather than defaulted. This module re-derives the
 * week from the anchor it is given, and an omitted weekday would silently snap
 * every weekly report back to Monday — the bug this parameter was added to fix.
 * Callers that genuinely have no setting should pass
 * `DEFAULT_WEEK_STARTS_ON` explicitly, so the choice is visible at the call site.
 *
 * `timezone` is required for every `Date`-typed column that has to be bucketed
 * into a calendar day. `.toISOString().slice(0, 10)` is UTC, so a goal completed
 * at 01:00 on the 1st in Auckland was counted in the previous month, and the same
 * off-by-one hit every user east of UTC. It is a parameter rather than a default
 * because a caller that forgot it would reintroduce exactly the bug this
 * signature is here to prevent.
 */
export async function weeklySummary(
  userId: UserId,
  weekStart: string,
  timezone: string,
  weekStartsOn: WeekStartsOn,
  today?: string,
  preloadedHabits?: PeriodHabitModel,
  preloadedScores?: DailyScore[]
): Promise<WeeklySummary> {
  const range = weekRange(weekStart, weekStartsOn);
  const previousStart = formatDate(addDays(range.startDate, -7));
  const previousEnd = formatDate(addDays(range.endDate, -7));
  const previousRange: DateRange = { startDate: previousStart, endDate: previousEnd };
  const dayToday = today ?? range.endDate;

  const [scores, previousScores, habitModel, sleepLogs, streak, goals, progressRows] =
    await Promise.all([
      /*
        Same escape hatch as `preloadedHabits`: a caller that already holds the
        week's rows passes them in rather than paying for a second identical
        read. `RecapService.buildWeek` used to do exactly that — it fetched this
        range, discarded the rows, then fetched them again to build its trend
        points, dragging the whole `calculationData` blob across the wire twice
        per week view.
      */
      preloadedScores
        ? Promise.resolve(preloadedScores)
        : scoreRepository.findByRange(userId, range.startDate, range.endDate),
      scoreRepository.findByRange(userId, previousStart, previousEnd),
      preloadedHabits ?? loadPeriodHabits(userId, range.startDate, range.endDate, dayToday),
      sleepRepository.findByRange(userId, range.startDate, range.endDate),
      streakRepository.findByUserId(userId),
      goalRepository.findAll(userId, {}),
      goalRepository.findProgressByUserRange(
        userId,
        fromZonedTime(`${range.startDate}T00:00:00`, timezone),
        fromZonedTime(`${range.endDate}T23:59:59.999`, timezone)
      ),
    ]);

  const scoredDays = scores.filter(score => score.totalScore !== null);
  const average = scoredDays.length > 0
    ? mean(scoredDays.map(score => score.totalScore ?? 0))
    : 0;

  const bestDay = scoredDays.reduce<{ date: string; score: number } | null>(
    (best, score) => (!best || (score.totalScore ?? 0) > best.score
      ? { date: score.date, score: score.totalScore ?? 0 }
      : best),
    null
  );
  const worstDay = scoredDays.reduce<{ date: string; score: number } | null>(
    (worst, score) => (!worst || (score.totalScore ?? 0) < worst.score
      ? { date: score.date, score: score.totalScore ?? 0 }
      : worst),
    null
  );

  const coreDays = scores.filter(score => score.coreScore !== null);
  const growthDays = scores.filter(score => score.growthScore !== null);
  const bonusDays = scores.filter(score => score.bonusScore !== null);

  const perHabit: WeeklyHabitPerformance[] = habitModel.perHabit.map((habit) => ({
    habitId: habit.habitId,
    habitName: habit.habitName,
    tier: habit.tier,
    completed: habit.completed,
    missed: habit.missed,
    skipped: habit.skipped,
    scheduled: habit.scheduled,
    completionRate: habit.rate,
  }));

  const withActivity = perHabit.filter(habit => habit.scheduled > 0);
  const mostCompleted = withActivity.length > 0
    ? withActivity.reduce((best, current) =>
        (current.completionRate ?? -1) > (best.completionRate ?? -1) ? current : best
      )
    : null;
  const mostMissed = perHabit.filter(habit => habit.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.skipped - a.skipped)[0] ?? null;

  /*
    Pooled, not the mean of the per-habit rates.

    The mean of rates gives a one-off habit the same vote as a twice-a-day one, so
    a user with one rare habit and one daily habit had their weekly number decided
    by whichever happened to deviate more. Pooling sums the numerators and the
    denominators, which is the same arithmetic `DailyScore.habitCompletionRate`
    uses, so the week total and the day tiles now agree by construction.
  */
  const completedTotal = habitModel.totals.completed;
  const scheduledTotal = habitModel.totals.scheduled;
  const averageCompletionRate =
    scheduledTotal > 0 ? round((completedTotal / scheduledTotal) * 100) : null;

  const previousAverage = previousScores.length > 0
    ? mean(previousScores.filter(s => s.totalScore !== null).map(s => s.totalScore ?? 0))
    : 0;

  const sleepAnalysis = analyzeSleep(
    sleepLogs.map(toSleepLogLike),
    APP_CONFIG.defaults.sleep.targetDuration
  );
  const nightsMeetingTarget = sleepLogs.filter(
    log => log.actualDurationMinutes !== null && log.actualDurationMinutes >= APP_CONFIG.defaults.sleep.targetDuration
  ).length;
  const daysFeltRested = await sleepRepository.countRestedDays(userId, range.startDate, range.endDate);

  const progressDeltas = groupProgressDelta(progressRows, range, timezone);

  // A completed goal is no longer ACTIVE, so a status filter could not see it.
  // The date part still needs the user's zone, because `completedAt` is an instant.
  const goalsCompleted = goals.filter(goal =>
    goal.status === 'COMPLETED' &&
    goal.completedAt !== null &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') >= range.startDate &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') <= range.endDate
  ).length;

  return {
    period: range,
    scores: {
      average: round(average),
      bestDay,
      worstDay,
      perfectDays: scoredDays.filter(score => score.totalScore !== null && score.totalScore >= 95).length,
      excellentDays: scoredDays.filter(score => score.totalScore !== null && score.totalScore >= 85).length,
      averageCore: coreDays.length > 0 ? round(mean(coreDays.map(s => s.coreScore ?? 0))) : null,
      averageGrowth: growthDays.length > 0 ? round(mean(growthDays.map(s => s.growthScore ?? 0))) : null,
      averageBonus: bonusDays.length > 0 ? round(mean(bonusDays.map(s => s.bonusScore ?? 0))) : null,
    },
    habits: {
      activeCount: habitModel.perHabit.length,
      averageCompletionRate,
      mostCompleted,
      mostMissed,
      perHabit,
    },
    sleep: {
      loggedDays: sleepLogs.length,
      averageDuration: Math.round(sleepAnalysis.averageDuration),
      averageQuality: sleepAnalysis.averageQuality,
      nightsMeetingTarget,
      daysFeltRested,
    },
    trend: {
      previousWeek: previousRange,
      previousAverage: round(previousAverage),
      delta: round(average - previousAverage),
    },
    goals: {
      completed: goalsCompleted,
      progressDelta: round(
        goals.reduce((sum, goal) => sum + (progressDeltas.get(goal.id) ?? 0), 0)
      ),
    },
    streaks: {
      current: streak?.currentStreak ?? 0,
      longest: streak?.longestStreak ?? 0,
    },
  };
}
