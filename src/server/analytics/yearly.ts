import type { HabitTier, SleepLog } from '@/generated/prisma';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_CONFIG } from '@/config/app';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
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

/**
 * Yearly Analytics
 * Year-level aggregates with a monthly score trend and habit/sleep/goal summary.
 */

const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();
const focusRepository = new FocusRepository();
const journalRepository = new JournalRepository();
const goalRepository = new GoalRepository();
const streakRepository = new StreakRepository();

export interface YearMonthScore {
  month: string;
  /** Scored days in the month. `0` means the month has no history yet. */
  days: number;
  /**
   * `null` when the month has no scored days.
   *
   * This used to be `0`, which drew a zero-height bar for every month the user had
   * not reached yet and made a half-finished year look like a year of zeroes. A
   * gap is the honest rendering of "we have no number for this month".
   */
  averageScore: number | null;
}

export interface YearlySummary {
  period: DateRange;
  totalDaysScored: number;
  /** `null` when nothing was scored in the year at all. */
  averageScore: number | null;
  bestMonth: { month: string; averageScore: number } | null;
  worstMonth: { month: string; averageScore: number } | null;
  monthlyScoreTrend: YearMonthScore[];
  habits: {
    /** `null` when nothing was due all year. */
    averageCompletionRate: number | null;
    bestHabit: { habitId: string; habitName: string; tier: HabitTier; completionRate: number } | null;
    mostMissedHabit: { habitId: string; habitName: string; tier: HabitTier; missedDays: number } | null;
    perHabit: Array<{ habitId: string; habitName: string; tier: HabitTier; completed: number; missed: number; completionRate: number | null }>;
    totalCompleted: number;
    totalMissed: number;
  };
  sleep: {
    averageDuration: number;
    averageQuality: number | null;
    daysFeltRested: number;
  };
  streaks: {
    current: number;
    longest: number;
  };
  goals: {
    completed: number;
    averageProgress: number;
  };
  focus: {
    totalSessions: number;
    totalFocusMinutes: number;
  };
  journal: {
    entryCount: number;
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

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Yearly summary for a given year.
 *
 * `timezone` matters twice here: the focus window used to be a UTC boundary
 * (`...T00:00:00.000Z`), which clipped the first local hours of 1 January for
 * everyone east of UTC, and goal `completedAt` was bucketed with
 * `.toISOString()`, which did the same thing in the other direction.
 */
export async function yearlySummary(
  userId: string,
  year: number,
  timezone: string,
  today?: string,
  preloadedHabits?: PeriodHabitModel
): Promise<YearlySummary> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const period: DateRange = { startDate, endDate };
  const dayToday = today ?? endDate;

  const rangeStart = fromZonedTime(`${startDate}T00:00:00`, timezone);
  const rangeEnd = fromZonedTime(`${endDate}T23:59:59.999`, timezone);

  const [scores, habitModel, sleepLogs, streak, focusStats, journalCount, goals] =
    await Promise.all([
      scoreRepository.findByRange(userId, startDate, endDate),
      preloadedHabits ?? loadPeriodHabits(userId, startDate, endDate, dayToday),
      sleepRepository.findByRange(userId, startDate, endDate),
      streakRepository.findByUserId(userId),
      focusRepository.getStats(userId, rangeStart, rangeEnd),
      /*
        One range count, not twelve `countByMonth` calls in a sequential loop.
        The loop was the single largest contributor to the year tab's latency:
        twelve dependent round trips where one predicate expresses the same thing.
      */
      journalRepository.countByRange(userId, startDate, endDate),
      goalRepository.findAll(userId, {}),
    ]);

  const scoredDays = scores.filter(score => score.totalScore !== null);
  const averageScore =
    scoredDays.length > 0 ? mean(scoredDays.map(score => score.totalScore ?? 0)) : null;

  const monthlyGroups = new Map<string, number[]>();
  for (const score of scoredDays) {
    const month = score.date.slice(0, 7);
    const bucket = monthlyGroups.get(month) ?? [];
    bucket.push(score.totalScore ?? 0);
    monthlyGroups.set(month, bucket);
  }

  const monthlyScoreTrend: YearMonthScore[] = Array.from({ length: 12 }, (_, index) => {
    const month = monthKey(year, index + 1);
    const values = monthlyGroups.get(month) ?? [];
    return {
      month,
      days: values.length,
      averageScore: values.length > 0 ? round(mean(values)) : null,
    };
  });

  const withData = monthlyScoreTrend.filter(
    (entry): entry is YearMonthScore & { averageScore: number } => entry.averageScore !== null
  );
  const bestMonth = withData.length > 0
    ? withData.reduce((best, current) => (current.averageScore > best.averageScore ? current : best))
    : null;
  const worstMonth = withData.length > 0
    ? withData.reduce((worst, current) => (current.averageScore < worst.averageScore ? current : worst))
    : null;

const perHabit = habitModel.perHabit.map((habit) => ({
    habitId: habit.habitId,
    habitName: habit.habitName,
    tier: habit.tier,
    completed: habit.completed,
    missed: habit.missed,
    completionRate: habit.rate,
  }));

  // A habit that was never due has no rate, so it cannot be anyone's star habit.
  const withActivity = perHabit.filter(
    (habit) => habit.completionRate !== null && (habit.completed > 0 || habit.missed > 0)
  );
  const bestHabit = withActivity.length > 0
    ? withActivity.reduce((best, current) =>
        (current.completionRate ?? -1) > (best.completionRate ?? -1) ? current : best
      )
    : null;
  const mostMissedHabit = perHabit.filter(habit => habit.missed > 0)
    .sort((a, b) => b.missed - a.missed)[0] ?? null;

  const totalCompleted = perHabit.reduce((sum, habit) => sum + habit.completed, 0);
  const totalMissed = perHabit.reduce((sum, habit) => sum + habit.missed, 0);
  const averageCompletionRate = habitModel.totals.rate;

  const sleepAnalysis = analyzeSleep(
    sleepLogs.map(toSleepLogLike),
    APP_CONFIG.defaults.sleep.targetDuration
  );
  const daysFeltRested = await sleepRepository.countRestedDays(userId, startDate, endDate);

  const goalsCompleted = goals.filter(goal =>
    goal.status === 'COMPLETED' &&
    goal.completedAt !== null &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') >= startDate &&
    formatInTimeZone(goal.completedAt, timezone, 'yyyy-MM-dd') <= endDate
  ).length;
  const goalsWithTarget = goals.filter(goal => goal.targetValue > 0);
  const averageProgress = goalsWithTarget.length > 0
    ? round(mean(goalsWithTarget.map(goal => (goal.currentValue / goal.targetValue) * 100)))
    : 0;

  return {
    period,
    totalDaysScored: scoredDays.length,
    averageScore: averageScore !== null ? round(averageScore) : null,
    bestMonth: bestMonth
      ? { month: bestMonth.month, averageScore: bestMonth.averageScore }
      : null,
    worstMonth: worstMonth
      ? { month: worstMonth.month, averageScore: worstMonth.averageScore }
      : null,
    monthlyScoreTrend,
    habits: {
      averageCompletionRate,
      bestHabit: bestHabit
        ? {
            habitId: bestHabit.habitId,
            habitName: bestHabit.habitName,
            tier: bestHabit.tier,
completionRate: bestHabit.completionRate ?? 0,
          }
        : null,
      mostMissedHabit: mostMissedHabit
        ? {
            habitId: mostMissedHabit.habitId,
            habitName: mostMissedHabit.habitName,
            tier: mostMissedHabit.tier,
            missedDays: mostMissedHabit.missed,
          }
        : null,
      perHabit,
      totalCompleted,
      totalMissed,
    },
    sleep: {
      averageDuration: Math.round(sleepAnalysis.averageDuration),
      averageQuality: sleepAnalysis.averageQuality,
      daysFeltRested,
    },
    streaks: {
      current: streak?.currentStreak ?? 0,
      longest: streak?.longestStreak ?? 0,
    },
    goals: {
      completed: goalsCompleted,
      averageProgress,
    },
    focus: {
      totalSessions: focusStats.totalSessions,
      totalFocusMinutes: focusStats.totalFocusMinutes,
    },
journal: {
      entryCount: journalCount,
    },
  };
}
