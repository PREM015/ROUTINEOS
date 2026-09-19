import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';

/**
 * AI Data Aggregator
 * Compact user data for AI analysis (NOT raw database dump)
 */

export async function aggregateUserDataForAI(
  userId: string,
  startDate: string,
  endDate: string
) {
  const habitRepository = new HabitRepository();
  const scoreRepository = new ScoreRepository();
  const goalRepository = new GoalRepository();
  const sleepRepository = new SleepRepository();
  const reflectionRepository = new ReflectionRepository();
  const streakRepository = new StreakRepository();

  // Get aggregated data (not raw logs)
  const [scores, habits, goals, sleepLogs, reflections, streak] = await Promise.all([
    scoreRepository.findByRange(userId, startDate, endDate),
    habitRepository.findAll(userId, { status: 'ACTIVE' }),
    goalRepository.findAll(userId, { status: 'ACTIVE' }),
    sleepRepository.findByRange(userId, startDate, endDate),
    reflectionRepository.findByRange(userId, startDate, endDate),
    streakRepository.findByUserId(userId),
  ]);

  // Calculate aggregates for habits
  const habitSummaries = await Promise.all(
    habits.slice(0, 10).map(async (habit) => {
      const logs = await habitRepository.findLogsByRange(
        habit.id,
        userId,
        startDate,
        endDate
      );

      const completed = logs.filter(l => l.status === 'COMPLETED').length;
      const missed = logs.filter(l => l.status === 'MISSED').length;

      return {
        name: habit.name,
        tier: habit.tier,
        completionRate: logs.length > 0 ? (completed / logs.length) * 100 : 0,
        totalLogs: logs.length,
        completed,
        missed,
        currentStreak: habit.streakCount,
      };
    })
  );

  // Score summary
  const scoreSummary = {
    averageScore: scores.length > 0
      ? scores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / scores.length
      : 0,
    perfectDays: scores.filter(s => s.totalScore && s.totalScore >= 95).length,
    minimumDays: scores.filter(s => s.isMinimumDay).length,
    restDays: scores.filter(s => s.isRestDay).length,
    totalDays: scores.length,
  };

  // Goal summary
  const goalSummary = goals.slice(0, 10).map(goal => ({
    title: goal.title,
    type: goal.type,
    priority: goal.priority,
    progress: (goal.currentValue / goal.targetValue) * 100,
    daysRemaining: Math.ceil(
      (new Date(goal.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  // Sleep summary
  const sleepSummary = {
    averageDuration: sleepLogs.length > 0
      ? sleepLogs.reduce((sum, s) => sum + (s.actualDurationMinutes || 0), 0) / sleepLogs.length
      : 0,
    averageQuality: sleepLogs.filter(s => s.quality).length > 0
      ? sleepLogs.reduce((sum, s) => sum + (s.quality || 0), 0) / sleepLogs.filter(s => s.quality).length
      : 0,
    daysRested: sleepLogs.filter(s => s.feltRested).length,
    totalDeficit: sleepLogs.reduce((sum, s) => sum + (s.deficitMinutes || 0), 0),
  };

  // Reflection summary
  const reflectionSummary = {
    averageEnergy: reflections.filter(r => r.energy).length > 0
      ? reflections.reduce((sum, r) => sum + (r.energy || 0), 0) / reflections.filter(r => r.energy).length
      : 0,
    averageMood: reflections.filter(r => r.mood).length > 0
      ? reflections.reduce((sum, r) => sum + (r.mood || 0), 0) / reflections.filter(r => r.mood).length
      : 0,
    averageStress: reflections.filter(r => r.stress).length > 0
      ? reflections.reduce((sum, r) => sum + (r.stress || 0), 0) / reflections.filter(r => r.stress).length
      : 0,
    totalReflections: reflections.length,
  };

  // Compact payload for AI
  return {
    period: { startDate, endDate },
    streak: {
      current: streak?.currentStreak || 0,
      longest: streak?.longestStreak || 0,
      totalDays: streak?.totalCompletedDays || 0,
    },
    scores: scoreSummary,
    habits: habitSummaries,
    goals: goalSummary,
    sleep: sleepSummary,
    wellbeing: reflectionSummary,
  };
}

/**
 * Validate aggregated data size
 */
export function validateDataSize(data: any): { valid: boolean; size: number } {
  const jsonString = JSON.stringify(data);
  const sizeInBytes = new Blob([jsonString]).size;
  const sizeInKB = sizeInBytes / 1024;

  // Limit to 50KB to prevent excessive token usage
  return {
    valid: sizeInKB <= 50,
    size: sizeInKB,
  };
}