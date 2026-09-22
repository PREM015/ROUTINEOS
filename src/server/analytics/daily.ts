import type { HabitLogStatus, HabitTier } from '@prisma/client';
import { APP_CONFIG } from '@/config/app';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';

/**
 * Daily Analytics
 * Per-day breakdown of score, habit tiers, routine, sleep, and reflection.
 */

const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();
const routineRepository = new RoutineRepository();
const sleepRepository = new SleepRepository();
const reflectionRepository = new ReflectionRepository();

export interface DailyTierBreakdown {
  tier: HabitTier;
  total: number;
  completed: number;
  missed: number;
  skipped: number;
  completionRate: number;
}

export interface DailyHabitStatus {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  status: HabitLogStatus | 'NOT_LOGGED';
  streakCount: number;
}

export interface DailyScoreBreakdown {
  total: number | null;
  core: number | null;
  growth: number | null;
  bonus: number | null;
  grade: string | null;
  isMinimumDay: boolean;
  isRestDay: boolean;
  habitCompletionRate: number | null;
  routineCompletionRate: number | null;
  sleepScore: number | null;
}

export interface DailySleepSummary {
  logged: boolean;
  durationMinutes: number | null;
  bedtime: string | null;
  wakeTime: string | null;
  quality: number | null;
  feltRested: boolean | null;
  metTarget: boolean | null;
}

export interface DailyReflectionSummary {
  energy: number | null;
  mood: number | null;
  biggestWin: string | null;
  biggestDifficulty: string | null;
}

export interface DailyBreakdown {
  date: string;
  score: DailyScoreBreakdown;
  tiers: DailyTierBreakdown[];
  habits: DailyHabitStatus[];
  habitReliability: number;
  routine: {
    completed: number;
    total: number;
    completionRate: number;
  };
  sleep: DailySleepSummary;
  reflection: DailyReflectionSummary;
  topMoments: string[];
  bottomMoments: string[];
}

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Per-tier habit completion counts for a single day.
 */
function buildTierBreakdowns(
  activeHabits: Array<{ id: string; tier: HabitTier }>,
  statusByHabit: Map<string, HabitLogStatus | undefined>
): DailyTierBreakdown[] {
  const byTier = new Map<HabitTier, DailyTierBreakdown>();

  for (const habit of activeHabits) {
    const bucket = byTier.get(habit.tier) ?? {
      tier: habit.tier,
      total: 0,
      completed: 0,
      missed: 0,
      skipped: 0,
      completionRate: 0,
    };
    bucket.total++;
    const status = statusByHabit.get(habit.id);
    if (status === 'COMPLETED') bucket.completed++;
    if (status === 'MISSED') bucket.missed++;
    if (status === 'SKIPPED') bucket.skipped++;
    byTier.set(habit.tier, bucket);
  }

  for (const bucket of byTier.values()) {
    bucket.completionRate = bucket.total > 0
      ? round((bucket.completed / bucket.total) * 100)
      : 0;
  }

  return Array.from(byTier.values());
}

/**
 * Daily breakdown of score, per-tier completion, habits, routine, sleep,
 * and reflection highlights for a single date.
 */
export async function dailyBreakdown(userId: string, date: string): Promise<DailyBreakdown> {
  const [score, habits, routineLogs, sleepLog, reflection] = await Promise.all([
    scoreRepository.findByDate(userId, date),
    habitRepository.findAll(userId, { status: 'ACTIVE' }),
    routineRepository.findLogsByDate(userId, date),
    sleepRepository.findByDate(userId, date),
    reflectionRepository.findByDate(userId, date),
  ]);

  const statusByHabitId = new Map<string, HabitLogStatus>();
  const logsForDate = await habitRepository.findLogsByDate(userId, date);
  for (const log of logsForDate) {
    statusByHabitId.set(log.habitId, log.status);
  }

  const loggedStatuses = new Map<string, HabitLogStatus | undefined>();
  for (const habit of habits) {
    loggedStatuses.set(habit.id, statusByHabitId.get(habit.id));
  }

  const tiers = buildTierBreakdowns(
    habits.map(habit => ({ id: habit.id, tier: habit.tier })),
    loggedStatuses
  );

  const habitStatuses: DailyHabitStatus[] = habits.map(habit => ({
    habitId: habit.id,
    habitName: habit.name,
    tier: habit.tier,
    status: statusByHabitId.get(habit.id) ?? 'NOT_LOGGED',
    streakCount: habit.streakCount,
  }));

  const completedHabitNames = habitStatuses
    .filter(habit => habit.status === 'COMPLETED')
    .map(habit => habit.habitName);
  const missedHabitNames = habitStatuses
    .filter(habit => habit.status === 'MISSED')
    .map(habit => habit.habitName);

  const routineCompleted = routineLogs.filter(log => log.status === 'COMPLETED').length;
  const routineTotal = routineLogs.length;

  const targetSleepMinutes = APP_CONFIG.defaults.sleep.targetDuration;
  const sleepDuration = sleepLog?.actualDurationMinutes ?? null;

  const topMoments = [reflection?.biggestWin, ...completedHabitNames]
    .filter((moment): moment is string => Boolean(moment))
    .slice(0, 5);
  const bottomMoments = [reflection?.biggestDifficulty, ...missedHabitNames]
    .filter((moment): moment is string => Boolean(moment))
    .slice(0, 5);

  return {
    date,
    score: {
      total: score?.totalScore ?? null,
      core: score?.coreScore ?? null,
      growth: score?.growthScore ?? null,
      bonus: score?.bonusScore ?? null,
      grade: score?.overallGrade ?? null,
      isMinimumDay: score?.isMinimumDay ?? false,
      isRestDay: score?.isRestDay ?? false,
      habitCompletionRate: score?.habitCompletionRate ?? null,
      routineCompletionRate: score?.routineCompletionRate ?? null,
      sleepScore: score?.sleepScore ?? null,
    },
    tiers,
    habits: habitStatuses,
    habitReliability: round(mean(tiers.map(tier => tier.completionRate))),
    routine: {
      completed: routineCompleted,
      total: routineTotal,
      completionRate: routineTotal > 0 ? round((routineCompleted / routineTotal) * 100) : 0,
    },
    sleep: {
      logged: Boolean(sleepLog),
      durationMinutes: sleepDuration,
      bedtime: sleepLog?.actualBedtime ?? null,
      wakeTime: sleepLog?.actualWakeTime ?? null,
      quality: sleepLog?.quality ?? null,
      feltRested: sleepLog?.feltRested ?? null,
      metTarget: sleepDuration !== null ? sleepDuration >= targetSleepMinutes : null,
    },
    reflection: {
      energy: reflection?.energy ?? null,
      mood: reflection?.mood ?? null,
      biggestWin: reflection?.biggestWin ?? null,
      biggestDifficulty: reflection?.biggestDifficulty ?? null,
    },
    topMoments,
    bottomMoments,
  };
}