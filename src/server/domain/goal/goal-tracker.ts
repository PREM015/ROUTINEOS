/**
 * Goal Tracker – pure domain logic for goal progress calculations.
 * Encapsulates progress math, velocity projection, expiry checks, and carry-over rules.
 * No DB access; callers supply raw values and history arrays.
 */

import type { GoalStatus } from '@/generated/prisma/client';

const MS_PER_DAY = 86_400_000;

// ============================================================================
// Types
// ============================================================================

/** Metric type of a goal – determines how remaining / progress is interpreted. */
export type GoalMetricType = 'VALUE' | 'PERCENT' | 'COUNT' | 'DURATION';

/** Single historical progress entry for velocity calculation. */
export interface GoalProgressEntry {
  /** ISO date (YYYY-MM-DD) when this entry was recorded. */
  date: string;
  /** Cumulative value reached on that date. */
  value: number;
}

export interface GoalProgressResult {
  /** Percentage toward target (0-100, clamped). */
  percentage: number;
  /** Achieved value clamped to target. */
  progress: number;
  /** Remaining value to reach target (>= 0). */
  remaining: number;
}

export interface CarryOverRules {
  /** Maximum number of times a goal can be carried over. */
  maxCarryOvers?: number;
  /** If true, carry-over is allowed before the deadline expires. */
  allowBeforeDeadline?: boolean;
  /** If true, progress resets to zero in the carried-over goal. */
  resetProgress?: boolean;
}

export type CarryOverDecisionReason =
  | 'ALLOWED'
  | 'ALREADY_COMPLETED'
  | 'MAX_CARRY_OVERS'
  | 'BEFORE_DEADLINE';

export interface CarryOverDecision {
  canCarryOver: boolean;
  reason: CarryOverDecisionReason;
}

/** Minimal shape of a goal required by this module. */
export interface GoalLike {
  status: GoalStatus;
  currentValue: number;
  targetValue: number;
  endDate: Date | string;
  carriedOverCount?: number | null;
}

// ============================================================================
// Helpers
// ============================================================================

function toMs(dateStr: string): number {
  const [y = '1970', m = '1', d = '1'] = dateStr.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);
}

// ============================================================================
// Progress
// ============================================================================

/**
 * Calculate progress metrics for a goal.
 * @example
 * calculateGoalProgress('VALUE', 70, 100)
 * // => { percentage: 70, progress: 70, remaining: 30 }
 */
export function calculateGoalProgress(
  type: GoalMetricType,
  current: number,
  target: number,
): GoalProgressResult {
  if (type === 'PERCENT') {
    const clamped = Math.min(100, Math.max(0, current));
    return {
      percentage: Math.round(clamped * 10) / 10,
      progress: clamped,
      remaining: Math.max(0, 100 - clamped),
    };
  }

  if (target <= 0) {
    return { percentage: 100, progress: 0, remaining: 0 };
  }

  const clampedCurrent = Math.max(0, current);
  const percentage = Math.min(100, (clampedCurrent / target) * 100);
  return {
    percentage: Math.round(percentage * 10) / 10,
    progress: Math.min(clampedCurrent, target),
    remaining: Math.max(0, target - clampedCurrent),
  };
}

/** Check whether a progress percentage meets or exceeds 100 %. */
export function isGoalCompleted(percentage: number): boolean {
  return percentage >= 100;
}

// ============================================================================
// Velocity & Projection
// ============================================================================

/**
 * Linear velocity of a goal's progress entries in value-per-day.
 * @example
 * velocityPerDay([
 *   { date: '2026-01-01', value: 10 },
 *   { date: '2026-01-11', value: 30 },
 * ]) // => 2
 */
export function velocityPerDay(history: GoalProgressEntry[]): number | null {
  if (history.length < 2) return null;

  const sorted = [...history].sort(
    (a, b) => toMs(a.date) - toMs(b.date),
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  const spanDays = daysBetween(first.date, last.date);
  if (spanDays <= 0) return null;

  return (last.value - first.value) / spanDays;
}

/**
 * Average velocity from `createdAt` to `today` based on `current` progress.
 * Used as a fallback when no history entries exist.
 */
function averageVelocitySince(
  createdAt: Date | string,
  current: number,
  today: string,
): number {
  const createdAtStr = typeof createdAt === 'string'
    ? createdAt
    : createdAt.toISOString().slice(0, 10);
  const elapsed = daysBetween(createdAtStr, today);
  return elapsed > 0 ? current / elapsed : 0;
}

/**
 * Project the date on which the goal will reach its target using linear
 * velocity derived from `history`. Returns the date string (YYYY-MM-DD) or
 * `null` when projection is not possible (no progress or negative velocity).
 * @example
 * projectCompletionDate('2026-01-01', 80, 100, [
 *   { date: '2026-01-01', value: 40 },
 *   { date: '2026-01-21', value: 80 },
 * ]) // => some date ~2026-02-10
 */
export function projectCompletionDate(
  createdAt: Date | string,
  current: number,
  target: number,
  history: GoalProgressEntry[],
  today: Date | string = new Date(),
): string | null {
  const todayStr = typeof today === 'string' ? today : today.toISOString().slice(0, 10);
  const remaining = target - current;
  if (remaining <= 0) return todayStr;

  const histVelocity = velocityPerDay(history);
  const effective = histVelocity ?? averageVelocitySince(createdAt, current, todayStr);
  if (effective <= 0) return null;

  const daysNeeded = Math.ceil(remaining / effective);
  const projectedMs = toMs(todayStr) + daysNeeded * MS_PER_DAY;
  return new Date(projectedMs).toISOString().slice(0, 10);
}

// ============================================================================
// Expiry
// ============================================================================

/**
 * Check whether a goal's deadline falls within `thresholdDays` of today
 * (including overdue goals).
 * @example
 * isGoalExpiring('2026-09-20', '2026-09-15') // => true (5 days left, default threshold 7)
 */
export function isGoalExpiring(
  deadline: Date | string,
  today: Date | string = new Date(),
  thresholdDays = 7,
): boolean {
  const deadlineStr = typeof deadline === 'string' ? deadline : deadline.toISOString().slice(0, 10);
  const todayStr = typeof today === 'string' ? today : today.toISOString().slice(0, 10);
  return daysBetween(todayStr, deadlineStr) <= thresholdDays;
}

// ============================================================================
// Carry-over
// ============================================================================

/**
 * Decide whether a goal can be carried over into a new period.
 * @example
 * canCarryOver({ status: 'ACTIVE', currentValue: 60, targetValue: 100, endDate: '2026-09-01', carriedOverCount: 0 })
 * // => { canCarryOver: true, reason: 'ALLOWED' }
 */
export function canCarryOver(
  goal: GoalLike,
  rules: CarryOverRules = {},
  today: Date | string = new Date(),
): CarryOverDecision {
  if (goal.status === 'COMPLETED') {
    return { canCarryOver: false, reason: 'ALREADY_COMPLETED' };
  }

  const deadlineStr = typeof goal.endDate === 'string'
    ? goal.endDate
    : goal.endDate.toISOString().slice(0, 10);
  const todayStr = typeof today === 'string' ? today : today.toISOString().slice(0, 10);

  if (daysBetween(deadlineStr, todayStr) < 0 && !rules.allowBeforeDeadline) {
    return { canCarryOver: false, reason: 'BEFORE_DEADLINE' };
  }

  if (
    rules.maxCarryOvers !== undefined &&
    (goal.carriedOverCount ?? 0) >= rules.maxCarryOvers
  ) {
    return { canCarryOver: false, reason: 'MAX_CARRY_OVERS' };
  }

  return { canCarryOver: true, reason: 'ALLOWED' };
}

/**
 * Compute the starting `currentValue` for a carried-over goal.
 * When `resetProgress` is true, only the raw carry-over amount is used;
 * otherwise the previous currentValue is accumulated with it.
 */
export function calculateCarryOverProgress(
  goal: Pick<GoalLike, 'currentValue' | 'targetValue'>,
  carryOverAmount: number,
  rules: CarryOverRules = {},
): number {
  const base = rules.resetProgress ? 0 : goal.currentValue;
  return Math.min(Math.max(0, base + Math.max(0, carryOverAmount)), goal.targetValue);
}

// ============================================================================
// Remaining days
// ============================================================================

/**
 * Number of calendar days between today and `deadline` (can be negative when overdue).
 * @example
 * getDaysRemaining('2026-09-30', '2026-09-28') // => 2
 */
export function getDaysRemaining(
  deadline: Date | string,
  today: Date | string = new Date(),
): number {
  const deadlineStr = typeof deadline === 'string' ? deadline : deadline.toISOString().slice(0, 10);
  const todayStr = typeof today === 'string' ? today : today.toISOString().slice(0, 10);
  return daysBetween(todayStr, deadlineStr);
}
