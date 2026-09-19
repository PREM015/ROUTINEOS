import { StreakRepository } from '@/server/repositories/streak.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import type { HabitTier } from '@prisma/client';

/**
 * Streak Calculation
 * Core logic for calculating and updating user streaks
 */

const streakRepository = new StreakRepository();
const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();

export interface StreakCalculationResult {
  changed: boolean;
  currentStreak: number;
  longestStreak: number;
  streakBroken: boolean;
  newMilestone?: number;
}

/**
 * Calculate streak for a user on a specific date
 */
export async function calculateStreak(
  userId: string,
  date: string,
  habitTier?: HabitTier
): Promise<StreakCalculationResult> {
  // Get user's current streak
  let streak = await streakRepository.findByUserId(userId);
  if (!streak) {
    streak = await streakRepository.create(userId);
  }

  const dateObj = new Date(date);
  const yesterday = new Date(dateObj);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get today's score
  const todayScore = await scoreRepository.findByDate(userId, date);

  // Get yesterday's score
  const yesterdayScore = await scoreRepository.findByDate(userId, yesterdayStr);

  const result: StreakCalculationResult = {
    changed: false,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    streakBroken: false,
  };

  // If today's score is a rest day, don't update streak
  if (todayScore?.isRestDay) {
    return result;
  }

  // If today's score is a minimum day, increment streak
  if (todayScore?.isMinimumDay) {
    const updated = await streakRepository.addMinimumDay(userId);
    result.changed = true;
    result.currentStreak = updated.currentStreak;

    // Check for milestone
    const milestone = checkStreakMilestone(updated.currentStreak);
    if (milestone) {
      result.newMilestone = milestone;
    }

    return result;
  }

  // If today was completed normally
  if (todayScore && todayScore.totalScore !== null && todayScore.totalScore >= 50) {
    // Check if streak continues from yesterday
    if (yesterdayScore) {
      // Streak continues
      const updated = await streakRepository.incrementCurrentStreak(userId, 1);
      result.changed = true;
      result.currentStreak = updated.currentStreak;

      // Update longest streak if needed
      if (updated.currentStreak > updated.longestStreak) {
        await streakRepository.update(userId, {
          longestStreak: updated.currentStreak,
        });
        result.longestStreak = updated.currentStreak;
      }

      // Check for milestone
      const milestone = checkStreakMilestone(updated.currentStreak);
      if (milestone) {
        result.newMilestone = milestone;
      }
    } else {
      // Start new streak
      const updated = await streakRepository.update(userId, {
        currentStreak: 1,
        streakStartDate: date,
        lastCompletedDate: date,
        totalCompletedDays: { increment: 1 },
      });
      result.changed = true;
      result.currentStreak = 1;
    }

    return result;
  }

  // Streak broken
  if (streak.currentStreak > 0) {
    await streakRepository.resetCurrentStreak(userId);
    result.changed = true;
    result.currentStreak = 0;
    result.streakBroken = true;
  }

  return result;
}

/**
 * Check if reached a streak milestone
 */
function checkStreakMilestone(currentStreak: number): number | undefined {
  const milestones = [7, 14, 21, 30, 60, 90, 100, 180, 365];

  for (const milestone of milestones) {
    if (currentStreak === milestone) {
      return milestone;
    }
  }

  return undefined;
}

/**
 * Record streak milestone
 */
export async function recordStreakMilestone(
  userId: string,
  milestoneDays: number,
  streakType: string = 'current'
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Check if already recorded
  const existing = await streakRepository.findMilestone(userId, milestoneDays, streakType);
  if (existing) {
    return;
  }

  // Record milestone
  await streakRepository.createMilestone({
    user: { connect: { id: userId } },
    milestoneDays,
    streakType,
    reachedDate: today,
  });
}

/**
 * Celebrate milestone
 */
export async function celebrateStreakMilestone(milestoneId: string): Promise<void> {
  await streakRepository.celebrateMilestone(milestoneId);

  // TODO: Trigger notification/achievement
}

/**
 * Get streak status text
 */
export function getStreakStatusText(currentStreak: number, longestStreak: number): string {
  if (currentStreak === 0) {
    return `Your longest streak was ${longestStreak} days`;
  }

  if (currentStreak === 1) {
    return 'You just started a new streak! 🔥';
  }

  if (currentStreak % 7 === 0) {
    return `Amazing! ${currentStreak} day streak! 🔥`;
  }

  return `${currentStreak} day streak 🔥`;
}

/**
 * Get next milestone
 */
export function getNextMilestone(currentStreak: number): { days: number; label: string } | null {
  const milestones = [
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
    { days: 21, label: '3 weeks' },
    { days: 30, label: '1 month' },
    { days: 60, label: '2 months' },
    { days: 90, label: '3 months' },
    { days: 100, label: '100 days' },
    { days: 180, label: '6 months' },
    { days: 365, label: '1 year' },
  ];

  for (const milestone of milestones) {
    if (currentStreak < milestone.days) {
      return milestone;
    }
  }

  return null;
}

/**
 * Days until next milestone
 */
export function daysUntilNextMilestone(currentStreak: number): number {
  const next = getNextMilestone(currentStreak);
  if (!next) return 0;
  return next.days - currentStreak;
}