/**
 * Sleep Types
 *
 * Complete type definitions for the RoutineOS sleep tracking system,
 * including logs, scores, duration, and conflict detection.
 */

// ============================================================
// ENUMS
// ============================================================

export enum SleepQuality {
  EXCELLENT = "EXCELLENT", // felt fully rested
  GOOD = "GOOD",           // mostly rested
  FAIR = "FAIR",           // somewhat rested
  POOR = "POOR",           // not well-rested
  TERRIBLE = "TERRIBLE",   // barely slept / very restless
}

// ============================================================
// SLEEP LOG
// ============================================================

export interface SleepLog {
  id: string;
  userId: string;

  /**
   * The calendar date this sleep entry "belongs to".
   * For overnight sleep (e.g., 23:00 → 07:00), this is the
   * date the person woke up (i.e., the morning date).
   */
  date: string; // ISO date YYYY-MM-DD

  // Times stored as ISO timestamps for timezone correctness
  bedtime: Date;
  wakeTime: Date;

  /** Duration in minutes, computed from bedtime → wakeTime */
  durationMinutes: number;

  /** Whether sleep crossed midnight (bedtime > wakeTime in wall-clock) */
  isOvernight: boolean;

  // Quality
  quality: SleepQuality | null;
  qualityScore: number | null; // 1-10 scale

  // Targets
  targetDurationMinutes: number | null;
  targetBedtime: string | null; // HH:mm
  targetWakeTime: string | null; // HH:mm

  // Computed
  sleepDebt: number | null; // minutes over/under target (negative = debt)
  metTarget: boolean | null;

  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SLEEP DURATION
// ============================================================

export interface SleepDuration {
  hours: number;
  minutes: number;
  totalMinutes: number;
  formatted: string; // "7h 30m"
}

// ============================================================
// SLEEP SCORE
// ============================================================

export interface SleepScore {
  /** 0-100 sleep quality score */
  score: number;
  /** Minutes of sleep debt (negative means extra sleep) */
  debtMinutes: number;
  /** Whether bedtime was on time */
  bedtimeOnTime: boolean;
  /** Whether wake time was on time */
  wakeTimeOnTime: boolean;
  /** How many minutes early/late bedtime was (negative = early) */
  bedtimeOffsetMinutes: number;
  /** How many minutes early/late wake was (negative = early) */
  wakeOffsetMinutes: number;
}

// ============================================================
// SLEEP CONFLICT
// ============================================================

export interface SleepConflict {
  type: "OVERLAPS_ROUTINE" | "EXCEEDS_TARGET" | "BELOW_MINIMUM" | "DUPLICATE";
  message: string;
  severity: "warning" | "error";
  conflictingBlockId?: string;
  conflictingBlockName?: string;
}

// ============================================================
// SLEEP TREND
// ============================================================

export interface SleepTrend {
  period: string; // e.g., "2026-W37"
  averageDurationMinutes: number;
  averageQualityScore: number | null;
  targetDurationMinutes: number;
  debtMinutes: number;
  entriesCount: number;
  daysMetTarget: number;
}

// ============================================================
// WEEKLY SLEEP SUMMARY
// ============================================================

export interface WeeklySleepSummary {
  weekStart: string;
  weekEnd: string;
  logs: SleepLog[];
  averageDuration: SleepDuration;
  averageQuality: number | null;
  totalDebtMinutes: number;
  daysMetTarget: number;
  bestNight: SleepLog | null;
  worstNight: SleepLog | null;
}

// ============================================================
// FORM DATA
// ============================================================

export interface LogSleepInput {
  date: string;
  bedtime: string; // ISO timestamp or HH:mm
  wakeTime: string; // ISO timestamp or HH:mm
  quality?: SleepQuality;
  qualityScore?: number;
  notes?: string;
}

export interface UpdateSleepInput extends Partial<LogSleepInput> {
  id: string;
}
