import type {
  RoutineTemplate,
  RoutineBlock,
  RoutineException,
  RoutineLog,
  DayType,
  RoutineLogStatus,
  Category,
} from '@prisma/client';

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

export interface ResolvedRoutineBlock {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  type: string;
  isFlex: boolean;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  status?: RoutineLogStatus;
  completedAt?: string | null;
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
// Utility Types
// ============================================================================

export type RoutineTemplatesByDayType = Record<DayType, RoutineTemplateWithBlocks[]>;

export type DayTypeLabels = Record<DayType, string>;

export type DayRoutine = ResolvedDailyRoutine;
export type DayRoutineBlock = ResolvedRoutineBlock;
export type CreateRoutineTemplateInput = RoutineTemplateCreateInput;
export type CreateRoutineBlockInput = RoutineBlockCreateInput;