import type {
  Habit,
  HabitLog,
  HabitOverride,
  HabitTier,
  HabitStatus,
  HabitLogStatus,
  HabitFrequencyType,
  HabitOverrideType,
  Category,
  Tag,
} from '@prisma/client';

export type {
  Habit,
  HabitLog,
  HabitOverride,
  HabitTier,
  HabitStatus,
  HabitLogStatus,
  HabitFrequencyType,
  HabitOverrideType,
  Category,
  Tag,
} from '@prisma/client';

/**
 * Habit Management Types
 * Complete type system for habit tracking and management
 */

// ============================================================================
// Core Habit Types
// ============================================================================

export interface HabitWithRelations extends Habit {
  category: Category | null;
  tags: Array<{ tag: Tag }>;
  logs: HabitLog[];
  overrides: HabitOverride[];
  _count?: {
    logs: number;
    overrides: number;
  };
}

export interface HabitListItem {
  id: string;
  name: string;
  description: string | null;
  tier: HabitTier;
  status: HabitStatus;
  color: string | null;
  icon: string | null;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  targetCount: number | null;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  streakCount: number;
  completionRate: number | null;
  lastCompletedDate: string | null;
}

// ============================================================================
// Habit Creation & Update
// ============================================================================

export interface CreateHabitInput {
  name: string;
  description?: string;
  tier: HabitTier;
  categoryId?: string;
  color?: string;
  icon?: string;
  frequencyType: HabitFrequencyType;
  frequencyValue?: string;
  targetCount?: number;
  startDate?: Date;
  endDate?: Date;
  reminderTime?: string;
  reminderEnabled?: boolean;
  points?: number;
  estimatedDuration?: number;
  difficulty?: number;
  isPublic?: boolean;
  tagIds?: string[];
}

export interface UpdateHabitInput {
  name?: string;
  description?: string;
  tier?: HabitTier;
  status?: HabitStatus;
  categoryId?: string | null;
  color?: string;
  icon?: string;
  frequencyType?: HabitFrequencyType;
  frequencyValue?: string;
  targetCount?: number;
  startDate?: Date;
  endDate?: Date;
  reminderTime?: string;
  reminderEnabled?: boolean;
  points?: number;
  estimatedDuration?: number;
  difficulty?: number;
  isPublic?: boolean;
  tagIds?: string[];
}

export interface CreateHabitResponse {
  success: boolean;
  habit?: HabitWithRelations;
  message?: string;
}

export interface UpdateHabitResponse {
  success: boolean;
  habit?: HabitWithRelations;
  message?: string;
}

// ============================================================================
// Habit Logging
// ============================================================================

export interface LogHabitInput {
  habitId: string;
  date: string; // YYYY-MM-DD
  status: HabitLogStatus;
  completedAt?: Date;
  durationMinutes?: number;
  quantity?: number;
  difficulty?: number;
  energyLevel?: number;
  moodBefore?: number;
  moodAfter?: number;
  note?: string;
}

export interface LogHabitResponse {
  success: boolean;
  log?: HabitLog;
  streakUpdated?: boolean;
  newStreak?: number;
  message?: string;
}

export interface BulkLogHabitsInput {
  logs: Array<{
    habitId: string;
    status: HabitLogStatus;
    note?: string;
  }>;
  date: string;
}

export interface BulkLogHabitsResponse {
  success: boolean;
  logged: number;
  failed: number;
  errors?: Array<{
    habitId: string;
    error: string;
  }>;
}

// ============================================================================
// Habit Overrides
// ============================================================================

export interface CreateHabitOverrideInput {
  habitId: string;
  type: HabitOverrideType;
  startDate: string;
  endDate?: string;
  reason?: string;
}

export interface CreateHabitOverrideResponse {
  success: boolean;
  override?: HabitOverride;
  message?: string;
}

// ============================================================================
// Habit Scheduling & Frequency
// ============================================================================

export interface HabitFrequency {
  type: HabitFrequencyType;
  value: string | null;
  displayText: string;
}

export interface HabitSchedule {
  habitId: string;
  isScheduledFor: (date: Date) => boolean;
  getNextScheduledDate: (after: Date) => Date | null;
  getPreviousScheduledDate: (before: Date) => Date | null;
}

export interface HabitEligibility {
  habitId: string;
  date: string;
  isEligible: boolean;
  reason?: HabitEligibilityReason;
  override?: HabitOverride;
  /** How the habit landed on a given day: by its schedule or added manually. */
  source?: 'SCHEDULED' | 'MANUAL';
}

export enum HabitEligibilityReason {
  SCHEDULED = 'SCHEDULED',
  NOT_SCHEDULED = 'NOT_SCHEDULED',
  BEFORE_START_DATE = 'BEFORE_START_DATE',
  AFTER_END_DATE = 'AFTER_END_DATE',
  PAUSED = 'PAUSED',
  SKIPPED = 'SKIPPED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  ARCHIVED = 'ARCHIVED',
}

// ============================================================================
// Habit Analytics
// ============================================================================

export interface HabitAnalytics {
  habitId: string;
  totalLogs: number;
  completedLogs: number;
  missedLogs: number;
  skippedLogs: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  averageDifficulty: number | null;
  averageDuration: number | null;
  totalDuration: number;
  lastCompletedDate: string | null;
  bestDay: {
    date: string;
    count: number;
  } | null;
  worstDay: {
    date: string;
    count: number;
  } | null;
}

export interface HabitTrendData {
  date: string;
  completed: number;
  missed: number;
  skipped: number;
  completionRate: number;
}

export interface HabitCalendarData {
  date: string;
  status: HabitLogStatus | null;
  note: string | null;
}

// ============================================================================
// Habit Queries & Filters
// ============================================================================

export interface HabitQueryParams {
  status?: HabitStatus | HabitStatus[];
  tier?: HabitTier | HabitTier[];
  categoryId?: string;
  tagId?: string;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'streak' | 'completionRate';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface HabitFilterOptions {
  statuses: HabitStatus[];
  tiers: HabitTier[];
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

// ============================================================================
// Today's Habits
// ============================================================================

export interface TodayHabit {
  id: string;
  name: string;
  description: string | null;
  tier: HabitTier;
  color: string | null;
  icon: string | null;
  targetCount: number | null;
  estimatedDuration: number | null;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  log: {
    id: string;
    status: HabitLogStatus;
    completedAt: Date | null;
    quantity: number | null;
    note: string | null;
  } | null;
  isEligible: boolean;
  eligibilityReason?: HabitEligibilityReason;
  /** 'SCHEDULED' for frequency-scheduled habits, 'MANUAL' for ad-hoc additions today. */
  source?: 'SCHEDULED' | 'MANUAL';
}

export interface TodayHabitsByTier {
  nonNegotiable: TodayHabit[];
  growth: TodayHabit[];
  bonus: TodayHabit[];
}

// ============================================================================
// Habit History
// ============================================================================

export interface HabitHistoryEntry {
  date: string;
  status: HabitLogStatus | null;
  completedAt: Date | null;
  durationMinutes: number | null;
  quantity: number | null;
  difficulty: number | null;
  note: string | null;
  isScheduled: boolean;
  override: {
    type: HabitOverrideType;
    reason: string | null;
  } | null;
}

export interface HabitHistoryRange {
  habitId: string;
  startDate: string;
  endDate: string;
  entries: HabitHistoryEntry[];
  stats: {
    totalDays: number;
    scheduledDays: number;
    completedDays: number;
    missedDays: number;
    skippedDays: number;
    completionRate: number;
  };
}

// ============================================================================
// Habit Actions
// ============================================================================

export interface ArchiveHabitInput {
  habitId: string;
  reason?: string;
}

export interface ArchiveHabitResponse {
  success: boolean;
  message: string;
}

export interface PauseHabitInput {
  habitId: string;
  reason?: string;
  resumeDate?: string;
}

export interface PauseHabitResponse {
  success: boolean;
  message: string;
  override?: HabitOverride;
}

export interface ResumeHabitInput {
  habitId: string;
}

export interface ResumeHabitResponse {
  success: boolean;
  message: string;
}

export interface SkipHabitInput {
  habitId: string;
  date: string;
  reason?: string;
}

export interface SkipHabitResponse {
  success: boolean;
  message: string;
  override?: HabitOverride;
}

// ============================================================================
// Habit Tier Metadata
// ============================================================================

export interface HabitTierConfig {
  tier: HabitTier;
  label: string;
  description: string;
  defaultPoints: number;
  defaultWeight: number;
  color: string;
  icon: string;
  suggestedFrequency: HabitFrequencyType[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isHabitWithRelations(habit: unknown): habit is HabitWithRelations {
  return (
    typeof habit === 'object' &&
    habit !== null &&
    'id' in habit &&
    'name' in habit &&
    'tier' in habit &&
    'category' in habit &&
    'tags' in habit
  );
}

export function isValidHabitLogStatus(status: unknown): status is HabitLogStatus {
  return (
    typeof status === 'string' &&
    ['COMPLETED', 'MISSED', 'SKIPPED', 'NOT_APPLICABLE', 'PARTIAL'].includes(status)
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type HabitGroupedByTier = Record<HabitTier, HabitListItem[]>;

export type HabitsByDate = Record<string, TodayHabit[]>;

export type HabitCompletionMap = Record<string, boolean>;