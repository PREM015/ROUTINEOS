import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import type { UserId } from '@/types/ids';

/**
 * Weekly Recap Generation
 * Generate comprehensive weekly summary
 */

export async function generateWeeklyRecap(userId: UserId, weekStart: string, weekEnd: string) {
  const habitRepository = new HabitRepository();
  const scoreRepository = new ScoreRepository();
  const goalRepository = new GoalRepository();
  const streakRepository = new StreakRepository();

  // Get scores for the week
  const scores = await scoreRepository.findByRange(userId, weekStart, weekEnd);
  
  // Average the days that actually carry a score. Dividing by every row in the
  // range treated an unscored day as a 0, so this week's headline average read
  // lower than the analytics hero and dashboard for the same week, which both
  // filter `totalScore !== null`. `0` when nothing is scored, matching those.
  const scoredScores = scores.filter(s => s.totalScore !== null);

  const averageScore = scoredScores.length > 0
    ? scoredScores.reduce((sum, s) => sum + (s.totalScore ?? 0), 0) / scoredScores.length
    : 0;

  const perfectDays = scores.filter(s => s.totalScore && s.totalScore >= 95).length;
  const excellentDays = scores.filter(s => s.totalScore && s.totalScore >= 85).length;

  // Get habit completion
  const habits = await habitRepository.findAll(userId, { status: 'ACTIVE' });
  const habitStats = await Promise.all(
    habits.map(async habit => {
      const logs = await habitRepository.findLogsByRange(habit.id, userId, weekStart, weekEnd);
      const completed = logs.filter(l => l.status === 'COMPLETED').length;
      const missed = logs.filter(l => l.status === 'MISSED').length;
      const skipped = logs.filter(l => l.status === 'SKIPPED').length;
      // The days the user was actually asked about — COMPLETED / MISSED /
      // SKIPPED — matching `getHabitHealth` and the habit detail. `logs.length`
      // also swept in PARTIAL and NOT_APPLICABLE rows, so simply recording a
      // reading (or a note) on a day dragged the rate down.
      const total = completed + missed + skipped;
      return {
        habitId: habit.id,
        habitName: habit.name,
        completed,
        total,
        rate: total > 0 ? (completed / total) * 100 : 0,
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
  // Inclusive of the whole of `weekEnd`: comparing against `new Date(weekEnd)`
  // (midnight) dropped a goal completed at any time on the final day.
  const goalsCompleted = goals.filter(g => 
    g.completedAt && 
    new Date(g.completedAt) >= new Date(`${weekStart}T00:00:00.000Z`) &&
    new Date(g.completedAt) <= new Date(`${weekEnd}T23:59:59.999Z`)
  ).length;

  // Get streak
  const streak = await streakRepository.findByUserId(userId);

  const totalCompleted = habitStats.reduce((sum, habit) => sum + habit.completed, 0);
  const totalScheduled = habitStats.reduce((sum, habit) => sum + habit.total, 0);
  const averageCompletion =
    habitStats.length > 0 && totalScheduled > 0
      ? (totalCompleted / totalScheduled) * 100
      : 0;

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
      totalCompleted,
      totalScheduled,
      mostConsistent,
      needsWork,
      // Pooled, not the mean of per-habit rates. Per-habit, a low-scheduled
      // habit (1 of 1) is worth as much as a daily habit (5 of 7); pooled, the
      // denominator is every due day in the week — the same figure
      // `weeklySummary` reports from `/api/analytics/weekly`.
      averageCompletion,
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