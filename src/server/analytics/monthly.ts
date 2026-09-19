import type { HabitTier, SleepLog } from '@prisma/client';
import { APP_CONFIG } from '@/config/app';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange } from '@/types/analytics';

/**
 * Monthly Analytics
 * Month-level aggregates: scores by tier, habit reliability matrix,
 * focus time, journal activity, and goal milestones.
 */

const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();
const sleepRepository = new SleepRepository();
const focusRepository = new FocusRepository();
const journalRepository = new JournalRepository();
const goalRepository = new GoalRepository();

export interface MonthlyHabitReliability {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  completionRate: number;
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
    averageCompletionRate: number;
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
 * Build week keys covering a month: each 7-day chunk anchored at its Monday.
 */
function monthWeeks(startDate: string, endDate: string): Array<{ index: number; start: string; end: string }> {
  const weeks: Array<{ index: number; start: string; end: string }> = [];
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const firstDay = new Date(startMs);
  const isoDay = firstDay.getUTCDay() === 0 ? 7 : firstDay.getUTCDay();
  let cursor = new Date(startMs - (isoDay - 1) * 86400000);
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  let index = 0;

  while (cursor.getTime() <= endMs) {
    const weekStart = cursor.toISOString().slice(0, 10);
    const weekEndDate = new Date(cursor.getTime() + 6 * 86400000);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    weeks.push({ index, start: weekStart, end: weekEnd });
    cursor = new Date(weekEndDate.getTime() + 86400000);
    index++;
  }

  return weeks;
}

/**
 * Monthly summary for a `YYYY-MM` month string.
 */
export async function monthlySummary(userId: string, month: string): Promise<MonthlySummary> {
  const [year, monthNumber] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate();
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  const period: DateRange = { startDate, endDate };

  const [scores, habits, sleepLogs, focusStats, journalCount, dailyGoals] = await Promise.all([
    scoreRepository.findByRange(userId, startDate, endDate),
    habitRepository.findAll(userId, { status: 'ACTIVE' }),
    sleepRepository.findByRange(userId, startDate, endDate),
    focusRepository.getStats(
      userId,
      new Date(`${startDate}T00:00:00.000Z`),
      new Date(`${endDate}T23:59:59.999Z`)
    ),
    journalRepository.countByMonth(userId, year ?? 0, monthNumber ?? 1),
    goalRepository.findAll(userId, {}),
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

  const weeks = monthWeeks(startDate, endDate);
  const perHabit: MonthlyHabitReliability[] = [];
  let totalCompleted = 0;
  let totalMissed = 0;
  let totalSkipped = 0;

  const tierStats = new Map<HabitTier, { count: number; completionRate: number }>();

  for (const habit of habits) {
    const logs = await habitRepository.findLogsByRange(habit.id, userId, startDate, endDate);
    const completed = logs.filter(log => log.status === 'COMPLETED').length;
    const missed = logs.filter(log => log.status === 'MISSED').length;
    const skipped = logs.filter(log => log.status === 'SKIPPED').length;
    totalCompleted += completed;
    totalMissed += missed;
    totalSkipped += skipped;

    const completionRate = logs.length > 0 ? (completed / logs.length) * 100 : 0;
    const tierBucket = tierStats.get(habit.tier) ?? { count: 0, completionRate: 0 };
    tierBucket.count++;
    tierBucket.completionRate += completionRate;
    tierStats.set(habit.tier, tierBucket);

    const weeklyRates = weeks.map(week => {
      const weekLogs = logs.filter(log => log.date >= week.start && log.date <= week.end);
      return weekLogs.length > 0
        ? round((weekLogs.filter(log => log.status === 'COMPLETED').length / weekLogs.length) * 100)
        : null;
    });

    perHabit.push({
      habitId: habit.id,
      habitName: habit.name,
      tier: habit.tier,
      completionRate: round(completionRate),
      weeklyRates,
    });
  }

  const byTier = Array.from(tierStats.entries()).map(([tier, stats]) => ({
    tier,
    count: stats.count,
    completionRate: stats.count > 0 ? round(stats.completionRate / stats.count) : 0,
  }));

  const averageCompletionRate = perHabit.length > 0
    ? round(mean(perHabit.map(habit => habit.completionRate)))
    : 0;

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
    goal.completedAt.toISOString().slice(0, 10) >= startDate &&
    goal.completedAt.toISOString().slice(0, 10) <= endDate
  ).length;

  const milestones = await Promise.all(
    dailyGoals.map(goal => goalRepository.getMilestones(goal.id))
  );
  const milestonesHit = milestones.flat().filter(milestone =>
    milestone.completedAt !== null &&
    milestone.completedAt.toISOString().slice(0, 10) >= startDate &&
    milestone.completedAt.toISOString().slice(0, 10) <= endDate
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
      milestonesHit,
    },
    sleep: {
      averageDuration: Math.round(sleepAnalysis.averageDuration),
      averageQuality: sleepAnalysis.averageQuality,
      nightsMeetingTarget,
    },
  };
}