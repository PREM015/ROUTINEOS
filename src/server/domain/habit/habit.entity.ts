/**
 * Habit Entity – domain entity encapsulating a habit's frequency + completion
 * state. Composes pure helpers; no DB access. Callers construct the entity
 * from repository-fetched rows.
 */

import type {
  HabitStatus,
  HabitTier,
  HabitFrequencyType,
} from '@/generated/prisma/client';

import {
  isHabitScheduledOn,
  daysScheduledPerWeek,
  getNextScheduledDate,
  parseFrequencyValue,
} from './habit-frequency';

// ============================================================================
// Types
// ============================================================================

export interface HabitEntityConfig {
  id: string;
  title: string;
  status: HabitStatus;
  tier: HabitTier;
  frequencyType: HabitFrequencyType;
  frequencyValue?: string | null;
  points?: number | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  currentStreak?: number;
}

/** Completion summary for a range. */
export interface CompletionSummary {
  totalScheduled: number;
  completed: number;
  missed: number;
  skipped: number;
  completionRate: number;
}

export interface CompletionResult {
  count: number;
  scheduled: number;
  percentage: number;
  achieved: boolean;
}

// ============================================================================
// Entity
// ============================================================================

/**
 * HabitEntity wraps a habit row with pure query helpers.
 * @example
 * const habit = new HabitEntity({
 *   id: '1', title: 'Read', status: 'ACTIVE', tier: 'GROWTH',
 *   frequencyType: 'DAILY', startDate: '2026-01-01', currentStreak: 4,
 * });
 * habit.isScheduledOn('2026-09-18') // => true
 */
export class HabitEntity {
  readonly id: string;
  readonly title: string;
  readonly status: HabitStatus;
  readonly tier: HabitTier;
  readonly frequencyType: HabitFrequencyType;
  readonly frequencyValue?: string | null;
  readonly points?: number | null;
  readonly startDate: Date | string;
  readonly endDate?: Date | string | null;
  readonly currentStreak: number;

  constructor(config: HabitEntityConfig) {
    this.id = config.id;
    this.title = config.title;
    this.status = config.status;
    this.tier = config.tier;
    this.frequencyType = config.frequencyType;
    this.frequencyValue = config.frequencyValue;
    this.points = config.points;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.currentStreak = config.currentStreak ?? 0;
  }

  /** UTC start date as YYYY-MM-DD. */
  get startDateStr(): string {
    return typeof this.startDate === 'string'
      ? this.startDate
      : this.startDate.toISOString().slice(0, 10);
  }

  get isCompleted(): boolean {
    return this.status === 'COMPLETED';
  }

  get isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  get isPaused(): boolean {
    return this.status === 'PAUSED';
  }

  get isArchived(): boolean {
    return this.status === 'ARCHIVED';
  }

  /** Whether the habit is scheduled on a date (see {@link isHabitScheduledOn}). */
  isScheduledOn(date: string): boolean {
    return isHabitScheduledOn(this.frequencyType, this.frequencyValue, date);
  }

  /** Expected completions per week for this habit. */
  get expectedPerWeek(): number {
    return daysScheduledPerWeek(this.frequencyType, this.frequencyValue);
  }

  /** Next scheduled date at-or-after `fromDate`, or null when indeterminate. */
  nextScheduledOnOrAfter(fromDate: string): string | null {
    return getNextScheduledDate(this.frequencyType, this.frequencyValue, fromDate);
  }

  /** Parsed daily/weekday cadence of the habit. */
  get cadence() {
    return parseFrequencyValue(this.frequencyType, this.frequencyValue);
  }

  /** Whether a value meets the habit's logged target requirement. */
  markedCompleteOn(date: string): boolean {
    return this.isScheduledOn(date);
  }

  /**
   * Predicted count of scheduled instances across a range, used to compute
   * target/workload expectations. Always >= 0.
   * @example
   * const h = new HabitEntity({ ..., frequencyType: 'SPECIFIC_WEEKDAYS', frequencyValue: '1,3,5', ... });
   * h.expectedCountFor('2026-09-14', '2026-09-20') // => up to 3
   */
  expectedCountFor(start: string, end: string): number {
    if (this.endDate) {
      const endStr = typeof this.endDate === 'string'
        ? this.endDate
        : this.endDate.toISOString().slice(0, 10);
      if (start > endStr) return 0;
    }
    let count = 0;
    const cfg = this.cadence;

    if (cfg.repeatEvery > 1) {
      // Approximate daily-interval habits by their cadence.
      const stepDays = cfg.repeatEvery;
      const estimated = 1 + Math.floor(
        (toUTCMs(end) - toUTCMs(start)) / (stepDays * 86_400_000),
      );
      count = Math.max(0, estimated);
    } else {
      for (let d = start; d <= end; d = nextDate(d)) {
        if (this.isScheduledOn(d)) count += 1;
      }
    }
    return count;
  }

  /**
   * Overall completion percentage for a given count vs expected count.
   * Returns 0 when no schedule exists (pure percentage 0..100).
   * @example
   * const h = new HabitEntity({ ..., frequencyType: 'WEEKLY_TARGET', frequencyValue: '4', ... });
   * h.completionFor(3) // => 75
   */
  completionFor(completedCount: number, scheduledCount?: number): number {
    const expected = scheduledCount ?? this.expectedPerWeek;
    if (expected <= 0) return 0;
    return Math.min(100, Math.max(0, (completedCount / expected) * 100));
  }

  /** Build a {count, scheduled, percentage, achieved} summary. */
  summariseCompletion(
    completedCount: number,
    scheduledCount?: number,
  ): CompletionResult {
    const scheduled = scheduledCount ?? this.expectedPerWeek;
    const percentage = this.completionFor(completedCount, scheduled);
    return {
      count: Math.max(0, completedCount),
      scheduled,
      percentage,
      achieved: percentage >= 100,
    };
  }

  /** Tentative streak-contribution flag (replaced by real log analysis). */
  get streakContribution(): boolean {
    return this.isActive && !this.isPaused;
  }
}

/** Compact factory equivalent of {@link HabitEntity}. */
export function createHabitEntity(config: HabitEntityConfig): HabitEntity {
  return new HabitEntity(config);
}

// ============================================================================
// Range helpers
// ============================================================================

function nextDate(dateStr: string): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function toUTCMs(dateStr: string): number {
  const [y = '1970', m = '1', d = '1'] = dateStr.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

/**
 * Aggregate a list of completion entries into a summary for a habit.
 * @example
 * summariseCompletions(['2026-09-18'], ['2026-09-18']) // => { totalScheduled: 1, completed: 1, ... }
 */
export function summariseCompletions(
  succeededDates: string[],
  scheduledDates: string[],
): CompletionSummary {
  const scheduledSet = new Set(scheduledDates);
  const completedSet = new Set(
    succeededDates.filter((d) => scheduledSet.has(d)),
  );

  let scheduled = 0;
  let completed = 0;
  for (const d of scheduledSet) {
    scheduled += 1;
    if (completedSet.has(d)) completed += 1;
  }
  const missed = scheduled - completed;
  const skipped = Math.max(0, succeededDates.length - completed);

  return {
    totalScheduled: scheduled,
    completed,
    missed: Math.max(0, missed),
    skipped,
    completionRate: scheduled > 0 ? (completed / scheduled) * 100 : 0,
  };
}