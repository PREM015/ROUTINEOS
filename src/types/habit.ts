import type {
  Habit,
  HabitLog,
  HabitOverride,
  HabitTier,
  HabitStatus,
  HabitLogStatus,
  HabitFrequencyType,
  HabitOverrideType,
  HabitTrackingType,
  HabitDirection,
  TimeOfDay,
  Category,
  Tag,
} from '@/generated/prisma';

export type {
  Habit,
  HabitLog,
  HabitOverride,
  HabitTier,
  HabitStatus,
  HabitLogStatus,
  HabitFrequencyType,
  HabitOverrideType,
  HabitTrackingType,
  HabitDirection,
  TimeOfDay,
  HabitDefinition,
  Category,
  Tag,
} from '@/generated/prisma';

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
  /** Provenance: non-null means this habit came from the shared catalogue. */
  definitionId: string | null;
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  targetValue: number | null;
  unit: string | null;
  timeOfDay: TimeOfDay | null;
  sortOrder: number;
  parentHabitId: string | null;
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
  /** Nullable so an empty field can be cleared: `undefined` never survives JSON.stringify. */
  description?: string | null;
  tier: HabitTier;
  categoryId?: string;
  color?: string | null;
  icon?: string | null;
  frequencyType: HabitFrequencyType;
  frequencyValue?: string | null;
  targetCount?: number | null;
  /** Catalogue provenance. `null` for a custom habit, which is fully supported. */
  definitionId?: string | null;
  trackingType?: HabitTrackingType;
  direction?: HabitDirection;
  targetValue?: number | null;
  unit?: string | null;
  timeOfDay?: TimeOfDay | null;
  sortOrder?: number;
  linkedMetricType?: string | null;
  intervalDays?: number | null;
  parentHabitId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  reminderTime?: string | null;
  reminderEnabled?: boolean;
  points?: number;
  estimatedDuration?: number;
  difficulty?: number;
  isPublic?: boolean;
  tagIds?: string[];
  appliesEveryDay?: boolean;
  dayTypeIds?: string[];
}

export interface UpdateHabitInput {
  name?: string;
  /** Nullable so an empty field can be cleared: `undefined` never survives JSON.stringify. */
  description?: string | null;
  tier?: HabitTier;
  status?: HabitStatus;
  categoryId?: string | null;
  color?: string | null;
  icon?: string | null;
  frequencyType?: HabitFrequencyType;
  frequencyValue?: string | null;
  targetCount?: number | null;
  definitionId?: string | null;
  trackingType?: HabitTrackingType;
  direction?: HabitDirection;
  targetValue?: number | null;
  unit?: string | null;
  timeOfDay?: TimeOfDay | null;
  sortOrder?: number;
  linkedMetricType?: string | null;
  intervalDays?: number | null;
  parentHabitId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  reminderTime?: string | null;
  reminderEnabled?: boolean;
  points?: number;
  estimatedDuration?: number;
  difficulty?: number;
  isPublic?: boolean;
  tagIds?: string[];
  appliesEveryDay?: boolean;
  dayTypeIds?: string[];
}

// ============================================================================
// Shared Catalogue
// ============================================================================

/**
 * What the user is allowed to change when adding a catalogue habit.
 *
 * Deliberately excludes `definitionId`, `userId` and `status`: the first is
 * decided by the caller, the second never comes from a client at all, and the
 * third is only ever set through the pause/resume/archive actions.
 */
export interface AddFromDefinitionOverrides {
  name?: string;
  description?: string | null;
  tier?: HabitTier;
  categoryId?: string | null;
  trackingType?: HabitTrackingType;
  direction?: HabitDirection;
  targetValue?: number | null;
  unit?: string | null;
  targetCount?: number | null;
  frequencyType?: HabitFrequencyType;
  frequencyValue?: string | null;
  intervalDays?: number | null;
  timeOfDay?: TimeOfDay | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  startDate?: Date | null;
  reminderTime?: string | null;
}

/**
 * A catalogue entry as the browse screen sees it.
 *
 * Carries only the *suggestion*. No user id, no counts of who uses it, nothing
 * derived from anyone's personal habits — a catalogue read must be incapable of
 * leaking one user's target or history to another.
 */
export interface HabitDefinitionCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  tier: HabitTier;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  targetValue: number | null;
  unit: string | null;
  targetCount: number | null;
  intervalDays: number | null;
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  timeOfDay: TimeOfDay | null;
  linkedMetricType: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  /** True when the signed-in user already has a personal copy. Purely a UI hint. */
  alreadyAdded?: boolean;
}

/** One habit a starter pack would create, as shown in the confirmation preview. */
export interface StarterPackHabitPreview {
  name: string;
  description: string | null;
  category: string | null;
  tier: HabitTier;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  trackingType: HabitTrackingType;
  direction: HabitDirection;
  targetValue: number | null;
  unit: string | null;
  intervalDays: number | null;
  timeOfDay: TimeOfDay | null;
  /** Absolute date this habit would start on, already offset for tier 2. */
  startDate: string;
  /** True when the user already has a habit by this name; it will not be touched. */
  alreadyExists: boolean;
  definitionId: string | null;
}

export interface StarterPackPreview {
  templateId: string | null;
  templateName: string;
  grouped: Array<{ tier: HabitTier; habits: StarterPackHabitPreview[] }>;
  totalHabits: number;
  skippedAsExisting: number;
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
  /** Nullable: an explicit null clears the column. `z.coerce.date()` would coerce null to 1970-01-01. */
  completedAt?: Date | null;
  durationMinutes?: number;
  /**
   * A float reading. The service decides the effective status from it against
   * the habit's own `trackingType`/`direction`/`targetValue` when the caller
   * sends `PARTIAL` or omits an explicit status.
   */
  quantity?: number;
  difficulty?: number;
  energyLevel?: number;
  moodBefore?: number;
  moodAfter?: number;
  note?: string | null;
  /**
   * Skip the direction-aware status derivation and store `status` verbatim.
   * Needed for a genuine partial day ("6000 of 15000") that must not be stored
   * as a completion.
   */
  statusIsExplicit?: boolean;
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
  source?: 'SCHEDULED' | 'MANUAL' | 'DAY_TYPE_FILTER';
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
  /**
   * The habit is restricted to specific Routine Day Types and today's day type is
   * not one of them.
   *
   * Previously this case reused `NOT_SCHEDULED`, which is a different concept
   * (the frequency schedule says the habit is not due today) and gave the user
   * no way to tell "you picked the wrong days for this habit" from "this habit
   * isn't due today".
   */
  DAY_TYPE_MISMATCH = 'DAY_TYPE_MISMATCH',
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
