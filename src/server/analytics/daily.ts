import type { HabitLogStatus, HabitTier } from '@/generated/prisma';
import { APP_CONFIG } from '@/config/app';
import { loadPeriodHabits } from '@/server/analytics/period-habits';
import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';

/**
 * Daily Analytics
 * Per-day breakdown of score, habit tiers, routine, sleep, and reflection.
 */

const scoreRepository = new ScoreRepository();
const routineRepository = new RoutineRepository();
const sleepRepository = new SleepRepository();
const reflectionRepository = new ReflectionRepository();

export interface DailyTierBreakdown {
  tier: HabitTier;
  /** Habits in this tier that were due on the date. */
  total: number;
  completed: number;
  missed: number;
  skipped: number;
  /** `null` when nothing in the tier was due. */
  completionRate: number | null;
}

export interface DailyHabitStatus {
  habitId: string;
  habitName: string;
  tier: HabitTier;
  status: HabitLogStatus | 'NOT_LOGGED' | 'NOT_DUE';
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
  /** `null` when nothing was due today, so "no habits due" is not 0%. */
  habitReliability: number | null;
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

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Daily breakdown of score, per-tier completion, habits, routine, sleep,
 * and reflection highlights for a single date.
 *
 * `timezone` and `today` exist for one reason: the habit numbers come from the
 * shared period model, which scores against the eligibility rule rather than
 * "every ACTIVE habit". A habit that is not scheduled for today is reported as
 * `NOT_DUE` and is left out of every tier total, where the previous version
 * counted it as a habit the user failed.
 */
export async function dailyBreakdown(
  userId: string,
  date: string,
  timezone: string,
  today?: string,
  preloadedHabits?: PeriodHabitModel
): Promise<DailyBreakdown> {
  const [score, habitModel, routineLogs, sleepLog, reflection] = await Promise.all([
    scoreRepository.findByDate(userId, date),
    preloadedHabits ?? loadPeriodHabits(userId, date, date, today ?? date),
    routineRepository.findLogsByDate(userId, date),
    sleepRepository.findByDate(userId, date),
    reflectionRepository.findByDate(userId, date),
  ]);
  void timezone;

  const tiers: DailyTierBreakdown[] = habitModel.byTier.map((tier) => ({
    tier: tier.tier,
    total: tier.scheduled,
    completed: tier.completed,
    missed: tier.missed,
    skipped: tier.skipped,
    completionRate: tier.rate,
  }));

  const habitStatuses: DailyHabitStatus[] = habitModel.perHabit.map((habit) => ({
    habitId: habit.habitId,
    habitName: habit.habitName,
    tier: habit.tier,
    status: statusOn(habit.habitId, habitModel, date),
    streakCount: habit.streakCount,
  }));

  const completedHabitNames = habitStatuses
    .filter((habit) => habit.status === 'COMPLETED')
    .map((habit) => habit.habitName);
  const missedHabitNames = habitStatuses
    .filter((habit) => habit.status === 'MISSED')
    .map((habit) => habit.habitName);

  const routineCompleted = routineLogs.filter((log) => log.status === 'COMPLETED').length;
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
    habitReliability: habitModel.totals.rate,
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

/**
 * The log status of one habit on one date, or `NOT_DUE` when the eligibility
 * rule says it was not scheduled.
 */
function statusOn(
  habitId: string,
  model: PeriodHabitModel,
  date: string
): HabitLogStatus | 'NOT_LOGGED' | 'NOT_DUE' {
  const day = model.days.find((entry) => entry.date === date);
  if (!day || !day.scheduledHabitIds.includes(habitId)) return 'NOT_DUE';
  // The model stores the raw enum from the log row; `HabitLogStatus` is that same
  // union widened to a string, so the cast is the same information twice.
  return (model.logStatuses.get(`${habitId}|${date}`) as HabitLogStatus | undefined) ?? 'NOT_LOGGED';
}
