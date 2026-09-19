import type { HabitOverrideType } from '@prisma/client';
import { HabitRepository } from '@/server/repositories/habit.repository';
import type { HabitEligibility, HabitEligibilityReason } from '@/types/habit';
import { isHabitScheduled } from './scheduling';

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
      reason: 'ARCHIVED',
    };
  }

  // Check if paused
  if (habit.status === 'PAUSED') {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'PAUSED',
    };
  }

  // Check start and end dates
  const dateObj = new Date(date);
  if (dateObj < new Date(habit.startDate)) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'BEFORE_START_DATE',
    };
  }

  if (habit.endDate && dateObj > new Date(habit.endDate)) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'AFTER_END_DATE',
    };
  }

  // Check for active overrides
  const overrides = await habitRepository.findActiveOverrides(habitId, userId, date);
  const skipOverride = overrides.find(o => o.type === 'SKIP_TODAY' || o.type === 'SKIP_RANGE');
  if (skipOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'SKIPPED',
      override: skipOverride,
    };
  }

  const pauseOverride = overrides.find(o => o.type === 'PAUSE');
  if (pauseOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'PAUSED',
      override: pauseOverride,
    };
  }

  const notApplicableOverride = overrides.find(o => o.type === 'NOT_APPLICABLE');
  if (notApplicableOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'NOT_APPLICABLE',
      override: notApplicableOverride,
    };
  }

  // Check if scheduled for this date
  const scheduled = await isHabitScheduled(habit, date);
  if (!scheduled) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'NOT_SCHEDULED',
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