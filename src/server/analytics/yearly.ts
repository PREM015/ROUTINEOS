import type { HabitTier, SleepLog } from '@prisma/client';
import { APP_CONFIG } from '@/config/app';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange } from '@/types/analytics';

/**
 * Yearly Analytics
 * Year-level aggregates with a monthly score trend and habit/sleep/goal summary.
 */

const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();
const focusRepository = new FocusRepository();
const journalRepository = new JournalRepository();
const goalRepository = new GoalRepository();
const streakRepository = new StreakRepository();

export interface YearlySummary {
  period: DateRange;
  totalDaysScored: number;
  averageScore: number;
  bestMonth: { month: string; averageScore: number } | null;
  worstMonth: { month: string; averageScore: number } | null;
  monthlyScoreTrend: Array<{ month: string; days: number; averageScore: number }>;
  habits: {
    averageCompletionRate: number;
    bestHabit: { habitId: string; habitName: string; tier: HabitTier; completionRate: number } | null;
    mostMissedHabit: { habitId: string; habitName: string; tier: HabitTier; missedDays: number } | null;
    perHabit: Array<{ habitId: string; habitName: string; tier: HabitTier; completed: number; missed: number; completionRate: number }>;
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
 */
export async function yearlySummary(userId: string, year: number): Promise<YearlySummary> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const period: DateRange = { startDate, endDate };

  const [scores, habits, sleepLogs, streak] = await Promise.all([
    scoreRepository.findByRange(userId, startDate, endDate),
    habitRepository.findAll(userId, { status: 'ACTIVE' }),
    sleepRepository.findByRange(userId, startDate, endDate),
    streakRepository.findByUserId(userId),
  ]);

  const scoredDays = scores.filter(score => score.totalScore !== null);
  const averageScore = scoredDays.length > 0
    ? mean(scoredDays.map(score => score.totalScore ?? 0))
    : 0;

  const monthlyGroups = new Map<string, number[]>();
  for (const score of scoredDays) {
    const month = score.date.slice(0, 7);
    const bucket = monthlyGroups.get(month) ?? [];
    bucket.push(score.totalScore ?? 0);
    monthlyGroups.set(month, bucket);
  }

  const monthlyScoreTrend = Array.from({ length: 12 }, (_, index) => {
    const month = monthKey(year, index + 1);
    const values = monthlyGroups.get(month) ?? [];
    return {
      month,
      days: values.length,
      averageScore: values.length > 0 ? round(mean(values)) : 0,
    };
  });

  const withData = monthlyScoreTrend.filter(entry => entry.days > 0);
  const bestMonth = withData.length > 0
    ? withData.reduce((best, current) => (current.averageScore > best.averageScore ? current : best))
    : null;
  const worstMonth = withData.length > 0
    ? withData.reduce((worst, current) => (current.averageScore < worst.averageScore ? current : worst))
    : null;

  const perHabit = await Promise.all(
    habits.map(async habit => {
      const logs = await habitRepository.findLogsByRange(habit.id, userId, startDate, endDate);
      const completed = logs.filter(log => log.status === 'COMPLETED').length;
      const missed = logs.filter(log => log.status === 'MISSED').length;
      return {
        habitId: habit.id,
        habitName: habit.name,
        tier: habit.tier,
        completed,
        missed,
        completionRate: logs.length > 0 ? (completed / logs.length) * 100 : 0,
      };
    })
  );

  const withActivity = perHabit.filter(habit => habit.completed > 0 || habit.missed > 0);
  const bestHabit = withActivity.length > 0
    ? withActivity.reduce((best, current) => (current.completionRate > best.completionRate ? current : best))
    : null;
  const mostMissedHabit = perHabit.filter(habit => habit.missed > 0)
    .sort((a, b) => b.missed - a.missed)[0] ?? null;

  const totalCompleted = perHabit.reduce((sum, habit) => sum + habit.completed, 0);
  const totalMissed = perHabit.reduce((sum, habit) => sum + habit.missed, 0);
  const averageCompletionRate = perHabit.length > 0
    ? round(mean(perHabit.map(habit => habit.completionRate)))
    : 0;

  const sleepAnalysis = analyzeSleep(
    sleepLogs.map(toSleepLogLike),
    APP_CONFIG.defaults.sleep.targetDuration
  );
  const daysFeltRested = await sleepRepository.countRestedDays(userId, startDate, endDate);

  const goals = await goalRepository.findAll(userId, {});
  const goalsCompleted = goals.filter(goal =>
    goal.status === 'COMPLETED' &&
    goal.completedAt !== null &&
    goal.completedAt.toISOString().slice(0, 10) >= startDate &&
    goal.completedAt.toISOString().slice(0, 10) <= endDate
  ).length;
  const goalsWithTarget = goals.filter(goal => goal.targetValue > 0);
  const averageProgress = goalsWithTarget.length > 0
    ? round(mean(goalsWithTarget.map(goal => (goal.currentValue / goal.targetValue) * 100)))
    : 0;

  const focusStats = await focusRepository.getStats(
    userId,
    new Date(`${startDate}T00:00:00.000Z`),
    new Date(`${endDate}T23:59:59.999Z`)
  );

  let journalEntryCount = 0;
  for (let month = 1; month <= 12; month++) {
    journalEntryCount += await journalRepository.countByMonth(userId, year, month);
  }

  return {
    period,
    totalDaysScored: scoredDays.length,
    averageScore: round(averageScore),
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
            completionRate: round(bestHabit.completionRate),
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
      perHabit: perHabit.map(habit => ({
        ...habit,
        completionRate: round(habit.completionRate),
      })),
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
      entryCount: journalEntryCount,
    },
  };
}