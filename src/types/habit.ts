/**
 * Habit Types
 *
 * Complete type definitions for the RoutineOS habit engine,
 * including habits, logs, tiers, frequency, and overrides.
 */

// ============================================================
// ENUMS
// ============================================================

export enum HabitTier {
  NON_NEGOTIABLE = "NON_NEGOTIABLE",
  GROWTH = "GROWTH",
  BONUS = "BONUS",
}

export enum HabitStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  ARCHIVED = "ARCHIVED",
  COMPLETED = "COMPLETED",
}

export enum HabitLogStatus {
  COMPLETED = "COMPLETED",
  MISSED = "MISSED",
  SKIPPED = "SKIPPED",
  NOT_APPLICABLE = "NOT_APPLICABLE",
  PARTIAL = "PARTIAL",
}

export enum HabitFrequencyType {
  DAILY = "DAILY",
  SPECIFIC_WEEKDAYS = "SPECIFIC_WEEKDAYS",
  WEEKLY_TARGET = "WEEKLY_TARGET",
  MONTHLY_TARGET = "MONTHLY_TARGET",
  YEARLY_TARGET = "YEARLY_TARGET",
  RANDOM = "RANDOM",
  ONE_TIME = "ONE_TIME",
  CUSTOM = "CUSTOM",
}

export enum HabitOverrideType {
  SKIP_TODAY = "SKIP_TODAY",
  SKIP_RANGE = "SKIP_RANGE",
  PAUSE = "PAUSE",
  NOT_APPLICABLE = "NOT_APPLICABLE",
  RESCHEDULE = "RESCHEDULE",
}

// ============================================================
// FREQUENCY CONFIGURATION
// ============================================================

export interface WeeklyFrequencyConfig {
  type: HabitFrequencyType.SPECIFIC_WEEKDAYS;
  /** 0=Sunday, 1=Monday, …, 6=Saturday */
  days: number[];
}

export interface WeeklyTargetConfig {
  type: HabitFrequencyType.WEEKLY_TARGET;
  target: number; // times per week
}

export interface MonthlyTargetConfig {
  type: HabitFrequencyType.MONTHLY_TARGET;
  target: number; // times per month
}

export interface YearlyTargetConfig {
  type: HabitFrequencyType.YEARLY_TARGET;
  target: number; // times per year
}

export interface DailyFrequencyConfig {
  type: HabitFrequencyType.DAILY;
}

export interface OneTimeFrequencyConfig {
  type: HabitFrequencyType.ONE_TIME;
  date: string; // ISO date
}

export interface CustomFrequencyConfig {
  type: HabitFrequencyType.CUSTOM;
  /** Cron-like expression or raw interval object */
  expression: string;
}

export type HabitFrequencyConfig =
  | DailyFrequencyConfig
  | WeeklyFrequencyConfig
  | WeeklyTargetConfig
  | MonthlyTargetConfig
  | YearlyTargetConfig
  | OneTimeFrequencyConfig
  | CustomFrequencyConfig;

// ============================================================
// CORE HABIT MODEL
// ============================================================

export interface Habit {
  id: string;
  userId: string;
  categoryId: string | null;

  // Identity
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;

  // Classification
  tier: HabitTier;
  status: HabitStatus;

  // Scheduling
  frequencyType: HabitFrequencyType;
  frequencyConfig: HabitFrequencyConfig | null;

  // Timing (optional)
  scheduledTime: string | null; // HH:mm
  estimatedDuration: number | null; // minutes

  // Lifecycle
  startDate: string; // ISO date
  endDate: string | null; // ISO date
  pausedAt: Date | null;
  pausedUntil: Date | null;
  archivedAt: Date | null;
  archiveReason: string | null;

  // Scoring
  weight: number;
  isActive: boolean;

  // Metadata
  notes: string | null;
  sortOrder: number;
  completionCount: number;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// HABIT LOG
// ============================================================

export interface HabitLog {
  id: string;
  userId: string;
  habitId: string;

  date: string; // ISO date YYYY-MM-DD
  status: HabitLogStatus;

  completedAt: Date | null;
  duration: number | null; // minutes actually spent
  value: number | null; // for numeric habits

  notes: string | null;
  mood: number | null; // 1-5 scale

  // Scoring snapshot
  scoreContribution: number | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// HABIT OVERRIDE
// ============================================================

export interface HabitOverride {
  id: string;
  userId: string;
  habitId: string;

  overrideType: HabitOverrideType;
  startDate: string; // ISO date
  endDate: string | null; // ISO date (null = indefinite)

  reason: string | null;

  createdAt: Date;
}

// ============================================================
// HABIT WITH RELATIONS
// ============================================================

export interface HabitWithLog extends Habit {
  todayLog: HabitLog | null;
  streak: number;
  completionRate: number; // 0-1
}

export interface HabitWithStats extends Habit {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  totalCompletions: number;
  lastCompleted: string | null;
}

// ============================================================
// GROUPED HABITS (for Today page)
// ============================================================

export interface GroupedHabits {
  nonNegotiable: HabitWithLog[];
  growth: HabitWithLog[];
  bonus: HabitWithLog[];
}

// ============================================================
// HABIT FORM DATA
// ============================================================

export interface CreateHabitInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  tier: HabitTier;
  categoryId?: string;
  frequencyType: HabitFrequencyType;
  frequencyConfig?: HabitFrequencyConfig;
  scheduledTime?: string;
  estimatedDuration?: number;
  startDate: string;
  endDate?: string;
  weight?: number;
  notes?: string;
}

export interface UpdateHabitInput extends Partial<CreateHabitInput> {
  id: string;
  status?: HabitStatus;
  sortOrder?: number;
}

export interface LogHabitInput {
  habitId: string;
  date: string;
  status: HabitLogStatus;
  notes?: string;
  duration?: number;
  value?: number;
  mood?: number;
}

export interface SkipHabitInput {
  habitId: string;
  date: string;
  reason?: string;
}

export interface PauseHabitInput {
  habitId: string;
  pausedUntil?: string; // ISO date
  reason?: string;
}
