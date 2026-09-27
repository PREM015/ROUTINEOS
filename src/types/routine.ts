import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
} from '@/generated/prisma';

export type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
};

/**
 * Routine Management Types
 * Complete type system for daily routine management
 */

// ============================================================================
// Core Routine Types
// ============================================================================

export interface RoutineTemplateWithBlocks extends RoutineTemplate {
  blocks: RoutineBlockWithCategory[];
  exceptions: RoutineException[];
  _count?: {
    blocks: number;
    exceptions: number;
  };
}

export interface RoutineBlockWithCategory extends RoutineBlock {
  category: Category | null;
}

export interface RoutineLogWithDetails extends RoutineLog {
  template: RoutineTemplate | null;
  block: RoutineBlock | null;
}

// ============================================================================
// Routine State & Query Types
// ============================================================================

export interface RoutineFilterOptions {
  dayType?: DayType;
  isActive?: boolean;
  isDefault?: boolean;
  search?: string;
  sortBy?: 'name' | 'dayType' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface RoutineBlockCreateInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  type: string;
  isFlex?: boolean;
  categoryId?: string;
}

export interface RoutineBlockUpdateInput {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  isFlex?: boolean;
  categoryId?: string;
}

export interface RoutineTemplateCreateInput {
  name: string;
  dayType: DayType;
  isDefault?: boolean;
  blocks?: RoutineBlockCreateInput[];
}

export interface RoutineTemplateUpdateInput {
  name?: string;
  dayType?: DayType;
  isDefault?: boolean;
  isActive?: boolean;
}

// ============================================================================
// Routine Resolution & Conflict Types
// ============================================================================

/**
 * The log fields the routine UI reads.
 *
 * The server sends a complete `RoutineLog` row, but the store also builds an
 * *optimistic* log client-side before any routine-log endpoint exists. That
 * optimistic object only carries user-editable fields, so it is not a full
 * `RoutineLog`. This interface is the intersection both satisfy — a full
 * `RoutineLog` is assignable to it, and so is the client's partial object.
 */
export interface ResolvedBlockLog {
  id: string;
  status: RoutineLogStatus;
  actualStartTime: string | null;
  actualEndTime: string | null;
  durationMinutes: number | null;
  focusRating: number | null;
  productivityRating: number | null;
  note: string | null;
}

export interface ResolvedRoutineBlock {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  notes: string | null;
  color: string | null;
  icon: string | null;
  /** Projected category — the resolver flattens the relation to three fields. */
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  /** `HIGH` / `MEDIUM` / `LOW`, free-text in the schema so nullable string. */
  energyLevel: string | null;
  trackCompletion: boolean;
  /** Derived from `startTime`/`endTime`; handles blocks crossing midnight. */
  durationMinutes: number;
  /** True when the block's end time is before its start time. */
  isOvernight: boolean;
  /** The user's log for this block on the resolved date, if any. */
  log: ResolvedBlockLog | null;
}

export interface ResolvedDailyRoutine {
  date: string;
  dayType: DayType;
  template: RoutineTemplate | null;
  exception: RoutineException | null;
  blocks: ResolvedRoutineBlock[];
  totalBlocks: number;
  completedBlocks: number;
  completionRate: number;
}

/**
 * Per-template routine analytics for a date range, as returned by
 * `RoutineService.getRoutineAnalytics`. Rates are `null` rather than `0` when
 * there is nothing to divide by, so "no data" is distinguishable from
 * "0% completion".
 */
export interface RoutineAnalytics {
  templateId: string;
  templateName: string;
  period: { startDate: string; endDate: string };
  totalBlocks: number;
  trackedBlocks: number;
  completion: {
    totalLogs: number;
    completedLogs: number;
    partialLogs: number;
    missedLogs: number;
    completionRate: number | null;
  };
  blocks: Array<{
    id: string;
    title: string;
    tracked: boolean;
    duration: number;
    logCount: number;
    completionRate: number | null;
  }>;
}

export interface RoutineConflict {
  type: 'OVERLAP' | 'INVALID_TIME' | 'DUPLICATE';
  message: string;
  blockId1?: string;
  blockId2?: string;
  startTime?: string;
  endTime?: string;
}

export interface RoutineValidationResult {
  isValid: boolean;
  conflicts: RoutineConflict[];
  warnings: string[];
}

// ============================================================================
// Routine Log & Tracking Types
// ============================================================================

export interface RoutineLogInput {
  templateId?: string;
  blockId?: string;
  date: string;
  status: RoutineLogStatus;
  notes?: string;
}

export interface RoutineLogSummary {
  date: string;
  totalBlocks: number;
  completedBlocks: number;
  skippedBlocks: number;
  missedBlocks: number;
  completionRate: number;
  logs: RoutineLog[];
}

export interface RoutineStats {
  period: 'week' | 'month' | 'year';
  totalScheduled: number;
  totalCompleted: number;
  totalSkipped: number;
  totalMissed: number;
  averageCompletionRate: number;
  mostConsistentDayType: DayType | null;
  completionByDayType: Record<DayType, number>;
}

// ============================================================================
// Routine Progress (dashboard widget)
// ============================================================================

export type RoutineProgressPeriod = 'day' | 'week' | 'month' | 'year';

export interface RoutineProgressBlock {
  blockId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: RoutineLogStatus | null;
}

export interface RoutineProgressDay {
  date: string;
  dayType: DayType;
  scheduled: boolean;
  total: number;
  completed: number;
  completionRate: number;
  blocks: RoutineProgressBlock[];
}

export interface RoutineProgressMonth {
  month: string; // YYYY-MM
  scheduledDays: number;
  averageCompletionRate: number;
}

export interface RoutineProgressResponse {
  period: RoutineProgressPeriod;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  days: RoutineProgressDay[];
  months: RoutineProgressMonth[];
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface RoutineListProps {
  date?: string;
  editable?: boolean;
  onBlockComplete?: (blockId: string) => void;
}

export interface RoutineBlockProps {
  block: ResolvedRoutineBlock;
  editable?: boolean;
  onComplete?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export interface RoutineTimelineProps {
  routine: ResolvedDailyRoutine;
  currentTime?: string;
  onBlockClick?: (block: ResolvedRoutineBlock) => void;
}

export interface RoutineEditorProps {
  template?: RoutineTemplateWithBlocks;
  onSave: (data: RoutineTemplateCreateInput | RoutineTemplateUpdateInput) => Promise<void>;
  onCancel: () => void;
}

// ============================================================================
// Helper Functions / Guards
// ============================================================================

export function isRoutineTemplateWithBlocks(
  template: unknown
): template is RoutineTemplateWithBlocks {
  return (
    typeof template === 'object' &&
    template !== null &&
    'blocks' in template &&
    Array.isArray((template as RoutineTemplateWithBlocks).blocks)
  );
}

export function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

export function isOvernightBlock(startTime: string, endTime: string): boolean {
  const [startHour = 0, startMin = 0] = startTime.split(':').map(Number);
  const [endHour = 0, endMin = 0] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes <= startMinutes;
}

// ============================================================================
// Day Type Definitions
// ============================================================================

/**
 * A user-defined day type.
 *
 * Canonical definition — this replaces four hand-rolled copies of the same
 * interface (routine/page.tsx, habits/page.tsx, AddHabitModal.tsx,
 * EditHabitModal.tsx), which had already drifted: only one of them declared the
 * optional `_count` block. Derived from the Prisma model so a schema change
 * surfaces here rather than in four places.
 */
export interface DayTypeDefinition {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
  /** Present only when the query includes a relation count; all keys then exist. */
  _count?: {
    routineTemplates: number;
    routineExceptions: number;
    habitAssignments: number;
    goalAssignments: number;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * A `DayTypeDefinition` projected for a `<select>`: the enum value it maps to
 * plus its display fields. Shared by the routine page and the routine-block
 * modal, which previously each declared their own structurally-different copy.
 */
export interface DayTypeOption {
  value: DayType;
  label: string;
  /** Nullable to match `DayTypeDefinition`; absent for the static defaults. */
  color?: string | null;
  icon?: string | null;
  dayTypeId?: string;
}

export type RoutineTemplatesByDayType = Record<DayType, RoutineTemplateWithBlocks[]>;

export type DayTypeLabels = Record<DayType, string>;

export type DayRoutine = ResolvedDailyRoutine;
export type DayRoutineBlock = ResolvedRoutineBlock;
export type CreateRoutineTemplateInput = RoutineTemplateCreateInput;
export type CreateRoutineBlockInput = RoutineBlockCreateInput;
