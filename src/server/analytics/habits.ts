import { HabitRepository } from '@/server/repositories/habit.repository';
import type { HabitAnalyticsSummary } from '@/types/analytics';

/**
 * Habit Analytics
 * Calculate comprehensive habit statistics
 */

const habitRepository = new HabitRepository();

export async function getHabitAnalytics(
  userId: string,
  habitId: string,
  startDate: string,
  endDate: string
): Promise<HabitAnalyticsSummary> {
  const habit = await habitRepository.findWithRelations(habitId, userId);
  if (!habit) {
    throw new Error('Habit not found');
  }

  const logs = await habitRepository.findLogsByRange(habitId, userId, startDate, endDate);

  // Calculate completion stats
  const totalDays = logs.length;
  const completedDays = logs.filter(l => l.status === 'COMPLETED').length;
  const missedDays = logs.filter(l => l.status === 'MISSED').length;
  const skippedDays = logs.filter(l => l.status === 'SKIPPED').length;
  const completionRate = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;

  // Calculate performance metrics
  const logsWithDifficulty = logs.filter(l => l.difficulty !== null);
  const averageDifficulty = logsWithDifficulty.length > 0
    ? logsWithDifficulty.reduce((sum, l) => sum + (l.difficulty || 0), 0) / logsWithDifficulty.length
    : null;

  const logsWithDuration = logs.filter(l => l.durationMinutes !== null);
  const averageDuration = logsWithDuration.length > 0
    ? Math.round(logsWithDuration.reduce((sum, l) => sum + (l.durationMinutes || 0), 0) / logsWithDuration.length)
    : null;

  const totalDuration = logsWithDuration.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);

  const logsWithEnergy = logs.filter(l => l.energyLevel !== null);
  const averageEnergyLevel = logsWithEnergy.length > 0
    ? logsWithEnergy.reduce((sum, l) => sum + (l.energyLevel || 0), 0) / logsWithEnergy.length
    : null;

  const logsWithMood = logs.filter(l => l.moodBefore !== null && l.moodAfter !== null);
  const averageMoodImprovement = logsWithMood.length > 0
    ? logsWithMood.reduce((sum, l) => sum + ((l.moodAfter || 0) - (l.moodBefore || 0)), 0) / logsWithMood.length
    : null;

  // Find best and worst days of week
  const dayStats: Record<number, { completed: number; total: number }> = {};
  logs.forEach(log => {
    const dayOfWeek = new Date(log.date).getDay();
    if (!dayStats[dayOfWeek]) {
      dayStats[dayOfWeek] = { completed: 0, total: 0 };
    }
    dayStats[dayOfWeek].total++;
    if (log.status === 'COMPLETED') {
      dayStats[dayOfWeek].completed++;
    }
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestDay: string | null = null;
  let worstDay: string | null = null;
  let bestRate = -1;
  let worstRate = 101;

  Object.entries(dayStats).forEach(([day, stats]) => {
    const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestDay = dayNames[parseInt(day)] ?? null;
    }
    if (rate < worstRate && stats.total > 0) {
      worstRate = rate;
      worstDay = dayNames[parseInt(day)] ?? null;
    }
  });

  // Calculate consistency score
  const consistencyScore = calculateConsistencyScore(logs);

  // Generate trends
  const trends = logs.map(log => ({
    date: log.date,
    completed: log.status === 'COMPLETED',
    duration: log.durationMinutes,
    difficulty: log.difficulty,
  }));

  return {
    habitId,
    habitName: habit.name,
    tier: habit.tier,
    period: { startDate, endDate },
    completion: {
      totalDays,
      scheduledDays: totalDays,
      completedDays,
      missedDays,
      skippedDays,
      completionRate: Math.round(completionRate * 100) / 100,
    },
    streaks: {
      current: habit.streakCount,
      longest: habit.longestStreak,
      average: completedDays > 0 ? Math.round((completedDays / totalDays) * 10) / 10 : 0,
    },
    performance: {
      averageDifficulty,
      averageDuration,
      totalDuration,
      averageEnergyLevel,
      averageMoodImprovement,
    },
    patterns: {
      bestDayOfWeek: bestDay,
      worstDayOfWeek: worstDay,
      consistencyScore,
    },
    trends,
  };
}

function calculateConsistencyScore(logs: Array<{ date: string; status: string }>): number {
  if (logs.length < 7) return 0;

  // Calculate weekly consistency
  const weeks: Record<string, { completed: number; total: number }> = {};

  logs.forEach(log => {
    const weekKey = getWeekKey(new Date(log.date));
    if (!weeks[weekKey]) {
      weeks[weekKey] = { completed: 0, total: 0 };
    }
    weeks[weekKey].total++;
    if (log.status === 'COMPLETED') {
      weeks[weekKey].completed++;
    }
  });

  // Calculate variance in weekly completion rates
  const weeklyRates = Object.values(weeks).map(w => 
    w.total > 0 ? (w.completed / w.total) * 100 : 0
  );

  const mean = weeklyRates.reduce((sum, rate) => sum + rate, 0) / weeklyRates.length;
  const variance = weeklyRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / weeklyRates.length;
  const stdDev = Math.sqrt(variance);

  // Lower standard deviation = higher consistency
  // Convert to 0-100 scale (inversely)
  const consistencyScore = Math.max(0, 100 - stdDev);

  return Math.round(consistencyScore);
}

function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}