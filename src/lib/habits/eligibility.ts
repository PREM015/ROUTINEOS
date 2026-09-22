import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { HabitEligibility, HabitEligibilityReason } from '@/types/habit';
import { DEFAULT_TZ } from '@/lib/dates';
import { isHabitScheduledForDate } from './scheduling';

/**
 * Habit Eligibility
 * Determine if a habit should be completed on a given date
 */

const habitRepository = new HabitRepository();

export async function calculateHabitEligibility(
  habitId: string,
  userId: string,
  date: string
): Promise<HabitEligibility> {
  // Get habit
  const habit = await habitRepository.findById(habitId, userId);
  if (!habit) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'HABIT_NOT_FOUND' as HabitEligibilityReason,
    };
  }

  // Check if archived
  if (habit.status === 'ARCHIVED') {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.ARCHIVED,
    };
  }

  // Check if paused
  if (habit.status === 'PAUSED') {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.PAUSED,
    };
  }

  // Check start and end dates (calendar-day comparison in the user's timezone,
  // so a habit created "today" is eligible today).
  const startDay = format(toZonedTime(habit.startDate, DEFAULT_TZ), 'yyyy-MM-dd');
  if (date < startDay) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.BEFORE_START_DATE,
    };
  }

  if (habit.endDate) {
    const endDay = format(toZonedTime(habit.endDate, DEFAULT_TZ), 'yyyy-MM-dd');
    if (date > endDay) {
      return {
        habitId,
        date,
        isEligible: false,
        reason: HabitEligibilityReason.AFTER_END_DATE,
      };
    }
  }

  // Check for active overrides
  const overrides = await habitRepository.findActiveOverrides(habitId, userId, date);
  const skipOverride = overrides.find(o => o.type === 'SKIP_TODAY' || o.type === 'SKIP_RANGE');
  if (skipOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.SKIPPED,
      override: skipOverride,
    };
  }

  const pauseOverride = overrides.find(o => o.type === 'PAUSE');
  if (pauseOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.PAUSED,
      override: pauseOverride,
    };
  }

  const notApplicableOverride = overrides.find(o => o.type === 'NOT_APPLICABLE');
  if (notApplicableOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.NOT_APPLICABLE,
      override: notApplicableOverride,
    };
  }

  // Check if scheduled for this date
  const scheduled = isHabitScheduledForDate(habit, date, DEFAULT_TZ);
  if (!scheduled) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.NOT_SCHEDULED,
    };
  }

  // Habit is eligible
  return {
    habitId,
    date,
    isEligible: true,
  };
}

export async function checkHabitEligibility(
  habitId: string,
  userId: string,
  date: string
): Promise<boolean> {
  const eligibility = await calculateHabitEligibility(habitId, userId, date);
  return eligibility.isEligible;
}