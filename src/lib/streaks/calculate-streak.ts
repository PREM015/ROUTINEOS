import { StreakRepository } from '@/server/repositories/streak.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { isStreakActiveDay } from '@/server/domain/streak/streak-calculator';
import type { HabitTier } from '@/generated/prisma';
import { THRESHOLDS } from '@/config/scoring';
import { previousCalendarDay } from '@/lib/dates';
import type { UserId } from '@/types/ids';

/**
 * Streak Calculation
 * Core logic for calculating and updating user streaks
 */

const streakRepository = new StreakRepository();
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
  userId: UserId,
  date: string,
  _habitTier?: HabitTier,
): Promise<StreakCalculationResult> {
  // Get user's current streak
  let streak = await streakRepository.findByUserId(userId);
  if (!streak) {
    streak = await streakRepository.create(userId);
  }

  // Previous calendar day, by pure string arithmetic.
  //
  // This used to be `new Date(date)` → `setDate(getDate() - 1)` →
  // `toISOString().slice(0, 10)`, which was wrong twice over. `new Date('2026-09-28')`
  // is UTC midnight, but `getDate()` reads the **host-local** day, so on a host
  // west of UTC it returned the 28th instead of the 27th; and east of UTC it
  // could return the 27th for two different inputs. `yesterdayStr` decides
  // whether a streak continues or resets, so a one-day drift here breaks a
  // streak that should have survived.
  const yesterdayStr = previousCalendarDay(date);

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
    // Same once-per-day requirement as the normal branch below: this runs on
    // every habit completion, so a user completing four habits on a minimum day
    // incremented their streak four times.
    if (streak.lastCompletedDate === date && streak.currentStreak > 0) {
      return result;
    }

    const updated = await streakRepository.addMinimumDay(userId, date);
    result.changed = true;
    result.currentStreak = updated.currentStreak;

    // Check for milestone
    const milestone = checkStreakMilestone(updated.currentStreak);
    if (milestone) {
      result.newMilestone = milestone;
    }

    return result;
  }

  // If today was completed normally.
  //
  // Uses the shared `isStreakActiveDay` predicate rather than a local
  // `totalScore >= 50` test, so the stored streak and the streak shown by
  // `analytics/streaks.ts` cannot diverge. See the note on that function.
  if (todayScore && isStreakActiveDay(todayScore)) {
    // A streak counts DAYS, and `calculateStreak` is called once per habit
    // completion. Completing four habits in one day therefore reached this
    // branch four times and incremented four times, so the stored row claimed
    // `currentStreak += 4` while every read path (`calculateCurrentStreak`)
    // derives one point per day — the stored value and the displayed value
    // disagreed for every user who completes more than one habit a day.
    //
    // `lastCompletedDate` is what makes the day idempotent: it is written to the
    // same `date` this call is scoring, so a second completion on the same day
    // sees it already set and does not count again. Continuing a streak from
    // yesterday is still the `else` branch's job.
    const alreadyCountedToday =
      streak.lastCompletedDate === date && streak.currentStreak > 0;

    if (alreadyCountedToday) {
      return result;
    }

    // Check if streak continues from yesterday
    if (yesterdayScore) {
      // Streak continues
      const updated = await streakRepository.incrementCurrentStreak(userId, 1, date);
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
      await streakRepository.update(userId, {
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
  for (const milestone of THRESHOLDS.streakMilestones) {
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
  userId: UserId,
  milestoneDays: number,
  streakType: string = 'current',
  /** The user's today. Required: UTC was used before and mis-dated the row. */
  today?: string,
): Promise<void> {
  if (!today) {
    // A milestone with no date is worse than none: it cannot be shown in any
    // date-bucketed query. Callers must pass the user's calendar day.
    throw new Error('recordStreakMilestone requires the user\'s current date');
  }

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
