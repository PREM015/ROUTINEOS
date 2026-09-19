import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
} from '@prisma/client';

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
  logs: RoutineLog[];
}

// ============================================================================
// Routine Template Management
// ============================================================================

export interface CreateRoutineTemplateInput {
  name: string;
  description?: string;
  dayType: DayType;
  isDefault?: boolean;
  color?: string;
  icon?: string;
}

export interface UpdateRoutineTemplateInput {
  name?: string;
  description?: string;
  dayType?: DayType;
  isDefault?: boolean;
  color?: string;
  icon?: string;
  isActive?: boolean;
}

export interface CreateRoutineTemplateResponse {
  success: boolean;
  template?: RoutineTemplateWithBlocks;
  message?: string;
}

export interface UpdateRoutineTemplateResponse {
  success: boolean;
  template?: RoutineTemplateWithBlocks;
  message?: string;
}

// ============================================================================
// Routine Block Management
// ============================================================================

export interface CreateRoutineBlockInput {
  templateId: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  title: string;
  description?: string;
  notes?: string;
  color?: string;
  icon?: string;
  categoryId?: string;
  energyLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  trackCompletion?: boolean;
  isRecurring?: boolean;
  sortOrder?: number;
}

export interface UpdateRoutineBlockInput {
  startTime?: string;
  endTime?: string;
  title?: string;
  description?: string;
  notes?: string;
  color?: string;
  icon?: string;
  categoryId?: string | null;
  energyLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  trackCompletion?: boolean;
  isRecurring?: boolean;
  sortOrder?: number;
}

export interface CreateRoutineBlockResponse {
  success: boolean;
  block?: RoutineBlockWithCategory;
  conflicts?: RoutineConflict[];
  message?: string;
}

export interface UpdateRoutineBlockResponse {
  success: boolean;
  block?: RoutineBlockWithCategory;
  conflicts?: RoutineConflict[];
  message?: string;
}

// ============================================================================
// Routine Conflicts
// ============================================================================

export interface RoutineConflict {
  type: 'TIME_OVERLAP' | 'DURATION_INVALID' | 'OVERNIGHT_CONFLICT';
  blockId: string;
  conflictingBlockId?: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: RoutineConflict[];
}

// ============================================================================
// Routine Exceptions
// ============================================================================

export interface CreateRoutineExceptionInput {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  templateId?: string;
  note?: string;
  reason?: string;
}

export interface CreateRoutineExceptionResponse {
  success: boolean;
  exception?: RoutineException;
  message?: string;
}

// ============================================================================
// Routine for Specific Day
// ============================================================================

export interface DayRoutine {
  date: string;
  dayType: DayType;
  isException: boolean;
  template: RoutineTemplateWithBlocks | null;
  blocks: DayRoutineBlock[];
}

export interface DayRoutineBlock {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  notes: string | null;
  color: string | null;
  icon: string | null;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  energyLevel: string | null;
  trackCompletion: boolean;
  durationMinutes: number;
  isOvernight: boolean;
  log: {
    id: string;
    status: RoutineLogStatus;
    actualStartTime: string | null;
    actualEndTime: string | null;
    durationMinutes: number | null;
    focusRating: number | null;
    productivityRating: number | null;
    note: string | null;
  } | null;
}

// ============================================================================
// Current Routine Block
// ============================================================================

export interface CurrentRoutineBlock {
  block: DayRoutineBlock;
  isActive: boolean;
  startedAt: Date;
  endsAt: Date;
  minutesElapsed: number;
  minutesRemaining: number;
  progressPercentage: number;
  nextBlock: DayRoutineBlock | null;
}

// ============================================================================
// Routine Logging
// ============================================================================

export interface LogRoutineBlockInput {
  routineBlockId: string;
  date: string;
  status: RoutineLogStatus;
  actualStartTime?: string;
  actualEndTime?: string;
  focusRating?: number; // 1-5
  productivityRating?: number; // 1-5
  energyLevel?: number; // 1-5
  note?: string;
}

export interface LogRoutineBlockResponse {
  success: boolean;
  log?: RoutineLog;
  message?: string;
}

// ============================================================================
// Routine Analytics
// ============================================================================

export interface RoutineAnalytics {
  templateId: string;
  totalBlocks: number;
  trackedBlocks: number;
  totalLogs: number;
  completedLogs: number;
  missedLogs: number;
  partialLogs: number;
  completionRate: number;
  averageFocusRating: number | null;
  averageProductivityRating: number | null;
  totalDuration: number; // planned minutes
  actualDuration: number; // logged minutes
  adherenceRate: number; // actual/planned
}

export interface RoutineBlockAnalytics {
  blockId: string;
  blockTitle: string;
  totalLogs: number;
  completedLogs: number;
  completionRate: number;
  averageFocusRating: number | null;
  averageProductivityRating: number | null;
  averageDelay: number; // minutes difference from planned start
  bestTime: string | null; // time of day with best focus
}

// ============================================================================
// Routine Calculations
// ============================================================================

export interface RoutineDuration {
  totalMinutes: number;
  hours: number;
  minutes: number;
  formattedDuration: string; // "2h 30m"
}

export interface TimeRange {
  startTime: string;
  endTime: string;
  isOvernight: boolean;
}

export interface TimeOverlap {
  overlaps: boolean;
  overlapMinutes: number;
}

// ============================================================================
// Routine Queries
// ============================================================================

export interface RoutineQueryParams {
  dayType?: DayType;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'dayType';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Routine Suggestions
// ============================================================================

export interface RoutineSuggestion {
  type: 'ADD_BLOCK' | 'ADJUST_TIME' | 'ENERGY_MISMATCH' | 'DURATION_WARNING';
  blockId?: string;
  message: string;
  suggestion: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ============================================================================
// Type Guards
// ============================================================================

export function isRoutineTemplateWithBlocks(
  template: unknown
): template is RoutineTemplateWithBlocks {
  return (
    typeof template === 'object' &&
    template !== null &&
    'id' in template &&
    'blocks' in template &&
    Array.isArray((template as RoutineTemplateWithBlocks).blocks)
  );
}

export function isValidTimeFormat(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

export function isOvernightBlock(startTime: string, endTime: string): boolean {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes <= startMinutes;
}

// ============================================================================
// Utility Types
// ============================================================================

export type RoutineTemplatesByDayType = Record<DayType, RoutineTemplateWithBlocks[]>;

export type DayTypeLabels = Record<DayType, string>;