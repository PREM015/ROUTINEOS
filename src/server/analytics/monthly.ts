import type { DailyScore, HabitTier, SleepLog } from '@/generated/prisma';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_CONFIG } from '@/config/app';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { getWeekRange, shiftCalendarDay } from '@/lib/dates';
import type { WeekStartsOn } from '@/lib/period-range';
import { loadPeriodHabits } from '@/server/analytics/period-habits';
import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange } from '@/types/analytics';
import type { UserId } from '@/types/ids';

/**
 * Monthly Analytics
 * Month-level aggregates: scores by tier, habit reliability matrix,
 * focus time, journal activity, and goal milestones.
 */

const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();
const focusRepository = new FocusRepository();
const journalRepository = new JournalRepository();
const goalRepository = new GoalRepository();

export interface MonthlyHabitReliability {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  /** `null` when the habit was never due this month. */
  completionRate: number | null;
  /** One entry per Monday-anchored week overlapping the month; `null` = nothing due. */
  weeklyRates: Array<number | null>;
}

export interface MonthlySummary {
  period: DateRange;
  scores: {
    average: number;
    perfectDays: number;
    excellentDays: number;
    bestDay: { date: string; score: number } | null;
    worstDay: { date: string; score: number } | null;
    byTier: Array<{ tier: HabitTier; count: number; completionRate: number }>;
  };
habits: {
    totalCompleted: number;
    totalMissed: number;
    totalSkipped: number;
    /** `null` when nothing was due all month, so an empty month is not 0%. */
    averageCompletionRate: number | null;
    perHabit: MonthlyHabitReliability[];
  };
  focus: {
    totalSessions: number;
    totalFocusMinutes: number;
    averageSessionMinutes: number;
  };
  journal: {
    entryCount: number;
  };
  goals: {
    completed: number;
    milestonesHit: number;
  };
  sleep: {
    averageDuration: number;
    averageQuality: number | null;
    nightsMeetingTarget: number;
  };
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
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

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

/**
 * Week slices covering a month, each starting on the user's chosen weekday.
 *
 * This existed to give `weeklyRates` a column per week, and it hardcoded Monday
 * with the same ISO arithmetic that `weekly.ts` used. So a Sunday-start user's
 * month was sliced into weeks that began on the wrong day — the per-week habit
 * rates did not sum to anything the user recognises as their week, while the
 * month's own start and end (which come from `getPeriodRange`) were correct.
 *
 * Built by repeatedly taking the next week from `getWeekRange` rather than by
 * advancing a cursor seven days at a time, so the slices stay aligned with the
 * user's weeks by construction instead of by coincidence.
 */
function monthWeeks(
  startDate: string,
  endDate: string,
  weekStartsOn: WeekStartsOn
): Array<{ index: number; start: string; end: string }> {
  const weeks: Array<{ index: number; start: string; end: string }> = [];
  let cursor = getWeekRange(startDate, weekStartsOn).start;
  const lastStart = getWeekRange(endDate, weekStartsOn).start;

  let index = 0;
  // Bounded by the last week that *begins* within the month, so a month that ends
  // mid-week still contributes its final partial slice. `cursor <= lastStart` on
  // `YYYY-MM-DD` labels is a safe string comparison.
  while (cursor <= lastStart) {
    const { start, end } = getWeekRange(cursor, weekStartsOn);
    weeks.push({ index, start, end });
    cursor = shiftCalendarDay(end, 1);
    index += 1;
  }

  return weeks;
}

/**
 * Monthly summary for a `YYYY-MM` month string.
 *
 * `timezone` drives the focus window. The range used to be built with
 * `new Date('2026-01-01T00:00:00.000Z')`, i.e. a UTC boundary, while every other
 * number on the page was resolved in the user's own zone. For a user east of UTC
 * that pushed the first local hours of the 1st out of the month, and for a user
 * west of UTC it pulled the last local hours of the last day in from the month
 * after.
 */
export async function monthlySummary(
  userId: UserId,
  month: string,
  timezone: string,
  weekStartsOn: WeekStartsOn,
  today?: string,
  preloadedHabits?: PeriodHabitModel,
  preloadedScores?: DailyScore[]
): Promise<MonthlySummary> {
  // Number() yields NaN for malformed input, and NaN is not nullish, so a `?? 0`
  // fallback here would never fire and would silently produce a range like
  // "2026-09-NaN". Validate the shape instead.
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error(`Invalid month "${month}": expected YYYY-MM`);
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month "${month}": month must be 01-12`);
  }

  const startDate = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  const period: DateRange = { startDate, endDate };
  const dayToday = today ?? endDate;

  const rangeStart = fromZonedTime(`${startDate}T00:00:00`, timezone);
  const rangeEnd = fromZonedTime(`${endDate}T23:59:59.999`, timezone);

  const [scores, habitModel, sleepLogs, focusStats, journalCount, dailyGoals, milestones] =
    await Promise.all([
      preloadedScores
        ? Promise.resolve(preloadedScores)
        : scoreRepository.findByRange(userId, startDate, endDate),
      preloadedHabits ?? loadPeriodHabits(userId, startDate, endDate, dayToday),
      sleepRepository.findByRange(userId, startDate, endDate),
      focusRepository.getStats(userId, rangeStart, rangeEnd),
      journalRepository.countByRange(userId, startDate, endDate),
      goalRepository.findAll(userId, {}),
      /*
        One range query instead of `getMilestones(goal.id)` per goal. A user with
        20 goals paid 20 round trips to count milestones that a single date-bounded
        query returns directly.
      */
      goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd),
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

  const weeks = monthWeeks(startDate, endDate, weekStartsOn);

  const perHabit: MonthlyHabitReliability[] = habitModel.perHabit.map((habit) => {
    // Weekly slices come from the same per-day ids, so a week rate cannot disagree
    // with the month rate it is a slice of.
    const weeklyRates = weeks.map((week) => {
      const daysInWeek = habitModel.days.filter(
        (day) => day.date >= week.start && day.date <= week.end
      );
      const weekScheduled = daysInWeek.reduce(
        (sum, day) => sum + day.scheduledHabitIds.filter((id) => id === habit.habitId).length,
        0
      );
      if (weekScheduled === 0) return null;
      const weekCompleted = daysInWeek.reduce(
        (sum, day) => sum + day.completedHabitIds.filter((id) => id === habit.habitId).length,
        0
      );
      return round((weekCompleted / weekScheduled) * 100);
    });

    return {
      habitId: habit.habitId,
      habitName: habit.habitName,
      tier: habit.tier,
      completionRate: habit.rate,
      weeklyRates,
    };
  });

  const totalCompleted = habitModel.totals.completed;
  const totalMissed = habitModel.perHabit.reduce((sum, habit) => sum + habit.missed, 0);
  const totalSkipped = habitModel.perHabit.reduce((sum, habit) => sum + habit.skipped, 0);

  const byTier = habitModel.byTier.map((tier) => ({
    tier: tier.tier,
    count: tier.count,
    completionRate: tier.rate ?? 0,
  }));

  const averageCompletionRate = habitModel.totals.rate;

  const sleepAnalysis = analyzeSleep(
    sleepLogs.map(toSleepLogLike),
    APP_CONFIG.defaults.sleep.targetDuration
  );
  const nightsMeetingTarget = sleepLogs.filter(
    log => log.actualDurationMinutes !== null && log.actualDurationMinutes >= APP_CONFIG.defaults.sleep.targetDuration
  ).length;

  const goalsCompleted = dailyGoals.filter(goal =>
    goal.status === 'COMPLETED' &&
    goal.completedAt !== null &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') >= startDate &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') <= endDate
  ).length;

  return {
    period,
    scores: {
      average: round(average),
      perfectDays: scoredDays.filter(score => score.totalScore !== null && score.totalScore >= 95).length,
      excellentDays: scoredDays.filter(score => score.totalScore !== null && score.totalScore >= 85).length,
      bestDay,
      worstDay,
      byTier,
    },
    habits: {
      totalCompleted,
      totalMissed,
      totalSkipped,
      averageCompletionRate,
      perHabit,
    },
    focus: {
      totalSessions: focusStats.totalSessions,
      totalFocusMinutes: focusStats.totalFocusMinutes,
      averageSessionMinutes: focusStats.averageSessionMinutes,
    },
    journal: {
      entryCount: journalCount,
    },
goals: {
      completed: goalsCompleted,
      milestonesHit: milestones.length,
    },
    sleep: {
      averageDuration: Math.round(sleepAnalysis.averageDuration),
      averageQuality: sleepAnalysis.averageQuality,
      nightsMeetingTarget,
    },
  };
}
