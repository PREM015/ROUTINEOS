import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';

/**
 * Weekly Recap Generation
 * Generate comprehensive weekly summary
 */

export async function generateWeeklyRecap(userId: string, weekStart: string, weekEnd: string) {
  const habitRepository = new HabitRepository();
  const scoreRepository = new ScoreRepository();
  const goalRepository = new GoalRepository();
  const streakRepository = new StreakRepository();

  // Get scores for the week
  const scores = await scoreRepository.findByRange(userId, weekStart, weekEnd);
  
  const averageScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / scores.length
    : 0;

  const perfectDays = scores.filter(s => s.totalScore && s.totalScore >= 95).length;
  const excellentDays = scores.filter(s => s.totalScore && s.totalScore >= 85).length;

  // Get habit completion
  const habits = await habitRepository.findAll(userId, { status: 'ACTIVE' });
  const habitStats = await Promise.all(
    habits.map(async habit => {
      const logs = await habitRepository.findLogsByRange(habit.id, userId, weekStart, weekEnd);
      const completed = logs.filter(l => l.status === 'COMPLETED').length;
      return {
        habitId: habit.id,
        habitName: habit.name,
        completed,
        total: logs.length,
        rate: logs.length > 0 ? (completed / logs.length) * 100 : 0,
      };
    })
  );

  const mostConsistent = habitStats.reduce((best, current) => 
    current.rate > (best?.rate || 0) ? current : best
  , habitStats[0] || null);

  const needsWork = habitStats.reduce((worst, current) => 
    current.rate < (worst?.rate || 100) && current.total > 0 ? current : worst
  , habitStats[0] || null);

  // Get goals progress
  const goals = await goalRepository.findAll(userId, { status: 'ACTIVE' });
  const goalsCompleted = goals.filter(g => 
    g.completedAt && 
    new Date(g.completedAt) >= new Date(weekStart) &&
    new Date(g.completedAt) <= new Date(weekEnd)
  ).length;

  // Get streak
  const streak = await streakRepository.findByUserId(userId);

  return {
    period: {
      weekStart,
      weekEnd,
      totalDays: 7,
    },
    scores: {
      average: Math.round(averageScore * 100) / 100,
      perfectDays,
      excellentDays,
      distribution: scores.map(s => ({
        date: s.date,
        score: s.totalScore,
        grade: s.overallGrade,
      })),
    },
    habits: {
      total: habits.length,
      totalCompleted: habitStats.reduce((sum, habit) => sum + habit.completed, 0),
      totalScheduled: habitStats.reduce((sum, habit) => sum + habit.total, 0),
      mostConsistent,
      needsWork,
      averageCompletion: habitStats.length > 0
        ? habitStats.reduce((sum, h) => sum + h.rate, 0) / habitStats.length
        : 0,
    },
    goals: {
      active: goals.length,
      completed: goalsCompleted,
    },
    streak: {
      current: streak?.currentStreak || 0,
      longest: streak?.longestStreak || 0,
    },
  };
}