/**
 * Habit Rules – pure domain logic for habit entry gating and state transitions.
 * Determines when a habit can be logged / skipped / paused / resumed and
 * validates computed values (target counts, points). No DB access.
 */

import type { HabitStatus, HabitLogStatus } from '@/generated/prisma/client';

import {
  isHabitScheduledOn,
  parseFrequencyValue,
} from './habit-frequency';

// ============================================================================
// Types
// ============================================================================

export type HabitRuleReason =
  | 'HABIT_NOT_FOUND'
  | 'HABIT_NOT_ACTIVE'
  | 'HABIT_PAUSED'
  | 'HABIT_ARCHIVED'
  | 'HABIT_COMPLETED'
  | 'HABIT_NOT_SCHEDULED_TODAY'
  | 'HABIT_SKIPPED_TODAY'
  | 'ALREADY_MARKED_TODAY'
  | 'ALLOWED';

export interface RuleResult {
  allowed: boolean;
  reason: HabitRuleReason;
}

/** Static schedule-like facts about a habit that rules rely on. */
export interface HabitScheduleInfo {
  status: HabitStatus;
  /** YYYY-MM-DD. */
  today: string;
  /** ISO date when the habit was paused, else null. */
  pausedSince?: string | null;
  /** True when the habit has a PAUSE override covering `today`. */
  pausedToday?: boolean;
  /** True when the habit has a SKIP_TODAY override for `today`. */
  skippedToday?: boolean;
  /** Days the habit is scheduled per week (for frequency checks). */
  scheduledToday?: boolean;
  /** Current streak of the habit. */
  currentStreak?: number;
}

/** A habit in shape suitable for rule evaluation. */
export interface HabitLike {
  id: string;
  status: HabitStatus;
  startDate: Date | string;
  endDate?: Date | string | null;
}

export interface LogEntryLike {
  habitId: string;
  /** YYYY-MM-DD. */
  date: string;
  status: HabitLogStatus;
}

// ============================================================================
// Status gates
// ============================================================================

/** Whether a habit can currently be logged at all. */
export function canLogHabit(habit: HabitLike, today: string): RuleResult {
  if (!habit) {
    return { allowed: false, reason: 'HABIT_NOT_FOUND' };
  }
  if (habit.status === 'PAUSED') {
    return { allowed: false, reason: 'HABIT_PAUSED' };
  }
  if (habit.status === 'ARCHIVED') {
    return { allowed: false, reason: 'HABIT_ARCHIVED' };
  }
  if (habit.status === 'COMPLETED') {
    return { allowed: false, reason: 'HABIT_COMPLETED' };
  }
  if (habit.status !== 'ACTIVE') {
    return { allowed: false, reason: 'HABIT_NOT_ACTIVE' };
  }
  const startStr = typeof habit.startDate === 'string'
    ? habit.startDate
    : habit.startDate.toISOString().slice(0, 10);
  if (today < startStr) {
    return { allowed: false, reason: 'HABIT_NOT_SCHEDULED_TODAY' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

/**
 * Full entry check combining status gates, schedule, and per-day overrides.
 * @example
 * canLogHabitEntry(
 *   { id: '1', status: 'ACTIVE', startDate: '2026-01-01' },
 *   { status: 'ACTIVE', today: '2026-09-18', scheduledToday: true, pausedToday: false },
 * )
 * // => { allowed: true, reason: 'ALLOWED' }
 */
export function canLogHabitEntry(
  habit: HabitLike,
  schedule: HabitScheduleInfo,
): RuleResult {
  const statusGate = canLogHabit(habit, schedule.today);
  if (!statusGate.allowed) return statusGate;

  if (schedule.skippedToday) {
    return { allowed: false, reason: 'HABIT_SKIPPED_TODAY' };
  }
  if (schedule.pausedToday) {
    return { allowed: false, reason: 'HABIT_PAUSED' };
  }
  if (schedule.scheduledToday === false) {
    return { allowed: false, reason: 'HABIT_NOT_SCHEDULED_TODAY' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

/** Whether a habit already has a logged entry on a given date. */
export function hasEntryOnDate(
  entries: LogEntryLike[],
  habitId: string,
  date: string,
): boolean {
  return entries.some((e) => e.habitId === habitId && e.date === date);
}

/** Whether the only entry on `date` is a SKIPPED one (no real progress). */
export function isOnlySkippedOnDate(
  entries: LogEntryLike[],
  habitId: string,
  date: string,
): boolean {
  const target = entries.filter((e) => e.habitId === habitId && e.date === date);
  return target.length > 0 && target.every((e) => e.status === 'SKIPPED');
}

// ============================================================================
// Skip / pause
// ============================================================================

/**
 * Decide whether a habit may be skipped on a date.
 * @example
 * canSkipHabit({ id: '1', status: 'ACTIVE', startDate: '2026-01-01' }, '2026-09-18')
 * // => { allowed: true, reason: 'ALLOWED' }
 */
export function canSkipHabit(habit: HabitLike, _today: string): RuleResult {
  if (!habit) return { allowed: false, reason: 'HABIT_NOT_FOUND' };
  if (habit.status !== 'ACTIVE') {
    return { allowed: false, reason: 'HABIT_NOT_ACTIVE' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

/**
 * Decide whether a habit may be paused indefinitely.
 * @example
 * canPause({ id: '1', status: 'ACTIVE', startDate: '2026-01-01' })
 * // => { allowed: true, reason: 'ALLOWED' }
 */
export function canPause(habit: HabitLike): RuleResult {
  if (!habit) return { allowed: false, reason: 'HABIT_NOT_FOUND' };
  if (habit.status === 'PAUSED') {
    return { allowed: false, reason: 'HABIT_PAUSED' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

/** Whether `habit` is paused on a given date. */
export function isPausedOn(
  habit: HabitLike,
  schedule: Pick<HabitScheduleInfo, 'pausedToday' | 'pausedSince'>,
  today: string,
): boolean {
  if (habit.status === 'PAUSED') return true;
  if (schedule.pausedToday) return true;
  if (schedule.pausedSince && today >= schedule.pausedSince) return true;
  return false;
}

/** Whether a paused habit may be resumed. */
export function canResume(habit: HabitLike): RuleResult {
  if (!habit) return { allowed: false, reason: 'HABIT_NOT_FOUND' };
  if (habit.status !== 'PAUSED') {
    return { allowed: false, reason: 'HABIT_NOT_ACTIVE' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}

// ============================================================================
// Value validation
// ============================================================================

/**
 * Validate a completion target count against a habit's scheduled requirement.
 * Returns `null` when no specific per-day target applies (e.g. target-count
 * frequencies), otherwise a numeric confidence multiplier 0..1.
 * @example
 * validateTargetCount(3, 3) // => 1
 * validateTargetCount(2, 3) // => 0.66
 */
export function validateTargetCount(
  completedCount: number,
  scheduledCount: number | null | undefined,
): number | null {
  if (scheduledCount === null || scheduledCount === undefined || scheduledCount <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, completedCount / scheduledCount));
}

export type PointsValidation = 'VALID' | 'BELOW_MIN' | 'ABOVE_MAX';

/**
 * Validate that a reward/points value stays within bounds.
 * @example
 * validatePoints(10, 0, 100) // => 'VALID'
 * validatePoints(-5, 0, 100) // => 'BELOW_MIN'
 */
export function validatePoints(
  value: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): PointsValidation {
  if (value < min) return 'BELOW_MIN';
  if (value > max) return 'ABOVE_MAX';
  return 'VALID';
}

/**
 * Allowlist of log-statuses that do not break a streak.
 * @example
 * isStreakSavingStatus('SKIPPED') // => true
 */
export function isStreakSavingStatus(status: HabitLogStatus): boolean {
  return status === 'COMPLETED' || status === 'SKIPPED' || status === 'MISSED';
}

// ============================================================================
// Re-exports (convenience for entry computations)
// ============================================================================

export {
  isHabitScheduledOn,
  parseFrequencyValue,
};