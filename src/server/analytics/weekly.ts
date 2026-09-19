import type { HabitTier, SleepLog } from '@prisma/client';
import { addDays } from 'date-fns';
import { APP_CONFIG } from '@/config/app';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange } from '@/types/analytics';

/**
 * Weekly Analytics
 * Aggregated weekly summary with score, habit, sleep, goal, and streak data.
 */

const habitRepository = new HabitRepository();
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
  scheduled: number;
  completionRate: number;
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
    averageCompletionRate: number;
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
 * Given an ISO date string, return the seven days of the week it falls in.
 */
function weekRange(dateStr: string): { start: string; end: string } {
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  const isoDay = parsed.getUTCDay() === 0 ? 7 : parsed.getUTCDay();
  const mondayOffset = isoDay - 1;
  const monday = new Date(parsed.getTime() - mondayOffset * 86400000);
  return {
    start: formatDate(monday),
    end: formatDate(new Date(monday.getTime() + 6 * 86400000)),
  };
}

/**
 * Net change in a goal's progress value during the week, derived from its
 * progress logs. Zero when there is no in-week progress history.
 */
async function goalProgressDelta(goalId: string, range: DateRange): Promise<number> {
  const history = await goalRepository.getProgressHistory(goalId, 100);
  const inWeek = history
    .filter(entry => {
      const day = entry.date.toISOString().slice(0, 10);
      return day >= range.startDate && day <= range.endDate;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (inWeek.length === 0) return 0;
  const newest = inWeek[inWeek.length - 1];
  const oldest = inWeek[0];
  return (newest?.value ?? 0) - (oldest?.value ?? 0);
}

/**
 * Weekly summary starting from a Monday (YYYY-MM-DD). Compares the week
 * against the immediately preceding week.
 */
export async function weeklySummary(userId: string, monday: string): Promise<WeeklySummary> {
  const range = weekRange(monday);
  const previousStart = formatDate(addDays(range.start, -7));
  const previousEnd = formatDate(addDays(range.end, -7));
  const previousRange: DateRange = { startDate: previousStart, endDate: previousEnd };

  const [scores, previousScores, habits, sleepLogs, streak] = await Promise.all([
    scoreRepository.findByRange(userId, range.startDate, range.endDate),
    scoreRepository.findByRange(userId, previousStart, previousEnd),
    habitRepository.findAll(userId, { status: 'ACTIVE' }),
    sleepRepository.findByRange(userId, range.startDate, range.endDate),
    streakRepository.findByUserId(userId),
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

  const perHabit = await Promise.all(
    habits.map(async habit => {
      const logs = await habitRepository.findLogsByRange(habit.id, userId, range.startDate, range.endDate);
      const completed = logs.filter(log => log.status === 'COMPLETED').length;
      const missed = logs.filter(log => log.status === 'MISSED').length;
      const skipped = logs.filter(log => log.status === 'SKIPPED').length;
      return {
        habitId: habit.id,
        habitName: habit.name,
        tier: habit.tier,
        completed,
        missed,
        skipped,
        scheduled: logs.length,
        completionRate: logs.length > 0 ? round((completed / logs.length) * 100) : 0,
      };
    })
  );

  const withActivity = perHabit.filter(habit => habit.scheduled > 0);
  const mostCompleted = withActivity.length > 0
    ? withActivity.reduce((best, current) => (current.completionRate > best.completionRate ? current : best))
    : null;
  const mostMissed = perHabit.filter(habit => habit.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.skipped - a.skipped)[0] ?? null;

  const averageCompletionRate = withActivity.length > 0
    ? round(mean(withActivity.map(habit => habit.completionRate)))
    : 0;

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

  const goals = await goalRepository.findAll(userId, { status: 'ACTIVE' });
  const progressDeltas = await Promise.all(
    goals.map(goal => goalProgressDelta(goal.id, range))
  );
  const goalsCompleted = (await goalRepository.findAll(userId, {})).filter(goal =>
    goal.status === 'COMPLETED' &&
    goal.completedAt !== null &&
    goal.completedAt.toISOString().slice(0, 10) >= range.startDate &&
    goal.completedAt.toISOString().slice(0, 10) <= range.endDate
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
      activeCount: habits.length,
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
      progressDelta: round(progressDeltas.reduce((sum, delta) => sum + delta, 0)),
    },
    streaks: {
      current: streak?.currentStreak ?? 0,
      longest: streak?.longestStreak ?? 0,
    },
  };
}