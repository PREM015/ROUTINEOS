import type {
  FocusSession,
  Break,
  TimeEntry,
  ProductivityPattern,
  Category,
  Project,
  Habit,
  Goal,
} from '@prisma/client';

/**
 * Focus & Time Tracking Types
 * Complete type system for deep work sessions, breaks, and time entries
 */

// ============================================================================
// Core Focus Types
// ============================================================================

export type FocusSessionStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface FocusSessionWithRelations extends FocusSession {
  category: Category | null;
  breaks: Break[];
  _count?: {
    breaks: number;
  };
}

export interface BreakWithRelations extends Break {
  focusSession: FocusSession | null;
}

export interface FocusSessionListItem {
  id: string;
  title: string;
  description: string | null;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  plannedDuration: number;
  actualDuration: number | null;
  startedAt: Date;
  completedAt: Date | null;
  status: FocusSessionStatus;
  focusRating: number | null;
  productivityRating: number | null;
  energyBefore: number | null;
  energyAfter: number | null;
  distractions: string[];
  techniques: string[];
  breakCount: number;
  totalBreakMinutes: number;
}

// ============================================================================
// Focus Session Lifecycle
// ============================================================================

export interface StartFocusSessionInput {
  title: string;
  description?: string;
  categoryId?: string;
  plannedDuration: number;
  techniques?: string[];
  energyBefore?: number;
}

export interface StartFocusSessionResponse {
  success: boolean;
  session?: FocusSessionWithRelations;
  timer?: FocusTimerSnapshot;
  message?: string;
}

export interface CompleteFocusSessionInput {
  sessionId: string;
  actualDuration?: number;
  focusRating?: number;
  productivityRating?: number;
  difficultyRating?: number;
  energyAfter?: number;
  distractions?: string[];
  notes?: string;
}

export interface CompleteFocusSessionResponse {
  success: boolean;
  session?: FocusSessionWithRelations;
  message?: string;
}

export interface CancelFocusSessionInput {
  sessionId: string;
  reason?: string;
}

export interface CancelFocusSessionResponse {
  success: boolean;
  message?: string;
}

export interface PauseFocusSessionInput {
  sessionId: string;
}

export interface PauseFocusSessionResponse {
  success: boolean;
  session?: FocusSessionWithRelations;
  timer?: FocusTimerSnapshot;
  message?: string;
}

export interface ResumeFocusSessionInput {
  sessionId: string;
}

export interface ResumeFocusSessionResponse {
  success: boolean;
  session?: FocusSessionWithRelations;
  timer?: FocusTimerSnapshot;
  message?: string;
}

export interface UpdateFocusSessionInput {
  title?: string;
  description?: string;
  categoryId?: string | null;
  plannedDuration?: number;
  notes?: string;
}

export interface UpdateFocusSessionResponse {
  success: boolean;
  session?: FocusSessionWithRelations;
  message?: string;
}

// ============================================================================
// Focus Timer
// ============================================================================

export type FocusTimerState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface FocusTimerSnapshot {
  sessionId: string;
  state: FocusTimerState;
  startedAt: Date | null;
  endsAt: Date | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercentage: number;
}

// ============================================================================
// Breaks
// ============================================================================

export type BreakType = 'SHORT' | 'LONG' | 'MEAL' | 'WALK' | 'REST' | 'CUSTOM';

export interface StartBreakInput {
  focusSessionId?: string;
  breakType?: BreakType;
}

export interface StartBreakResponse {
  success: boolean;
  break?: BreakWithRelations;
  message?: string;
}

export interface EndBreakInput {
  breakId: string;
  quality?: number;
  notes?: string;
}

export interface EndBreakResponse {
  success: boolean;
  break?: BreakWithRelations;
  durationMinutes?: number;
  message?: string;
}

export interface CreateBreakInput {
  focusSessionId?: string;
  startedAt: Date;
  endedAt?: Date;
  durationMinutes?: number;
  breakType?: BreakType;
  quality?: number;
  notes?: string;
}

export interface CreateBreakResponse {
  success: boolean;
  break?: BreakWithRelations;
  message?: string;
}

// ============================================================================
// Time Entries
// ============================================================================

export interface TimeEntryWithRelations extends TimeEntry {
  project: Project | null;
  habit: Habit | null;
  goal: Goal | null;
}

export interface TimeEntryListItem {
  id: string;
  description: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  project: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  habit: {
    id: string;
    name: string;
  } | null;
  goal: {
    id: string;
    title: string;
  } | null;
  billable: boolean;
  rate: number | null;
  tags: string[];
  isAutomatic: boolean;
}

export interface CreateTimeEntryInput {
  description: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  projectId?: string | null;
  habitId?: string | null;
  goalId?: string | null;
  billable?: boolean;
  rate?: number;
  tags?: string[];
  isAutomatic?: boolean;
}

export interface UpdateTimeEntryInput {
  description?: string;
  startTime?: Date;
  endTime?: Date | null;
  duration?: number;
  projectId?: string | null;
  habitId?: string | null;
  goalId?: string | null;
  billable?: boolean;
  rate?: number | null;
  tags?: string[];
}

export interface CreateTimeEntryResponse {
  success: boolean;
  entry?: TimeEntryWithRelations;
  message?: string;
}

export interface UpdateTimeEntryResponse {
  success: boolean;
  entry?: TimeEntryWithRelations;
  message?: string;
}

// ============================================================================
// Productivity Patterns
// ============================================================================

export type ProductivityPatternType = 'PEAK_HOURS' | 'LOW_ENERGY' | 'CONTEXT_SWITCH';

export interface ProductivityPatternMetrics {
  averageFocusRating: number;
  averageProductivityRating: number;
  averageSessionDuration: number;
  sessionCount: number;
  completionRate: number;
  energyAverage: number;
}

export type ProductivityPatternWithMetrics = Omit<
  ProductivityPattern,
  'metrics' | 'dayOfWeek'
> & {
  dayOfWeekValues: number[];
  metrics: ProductivityPatternMetrics;
};

export interface CreateProductivityPatternInput {
  patternType: ProductivityPatternType;
  timeOfDay: string;
  dayOfWeek: number[];
  confidence: number;
  metrics: ProductivityPatternMetrics;
}

export interface ProductivityPatternSummary {
  patternType: ProductivityPatternType;
  timeOfDay: string;
  dayOfWeek: number[];
  confidence: number;
  averageFocusRating: number;
  sessionCount: number;
  recommendation: string;
}

// ============================================================================
// Focus Analytics
// ============================================================================

export interface FocusAnalytics {
  period: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  totals: {
    sessions: number;
    plannedMinutes: number;
    actualMinutes: number;
    completionRate: number;
  };
  averages: {
    sessionDuration: number;
    focusRating: number | null;
    productivityRating: number | null;
    breakMinutesPerSession: number;
  };
  daily: FocusTrendPoint[];
  bestDay: {
    date: string;
    focusMinutes: number;
  } | null;
  worstDay: {
    date: string;
    focusMinutes: number;
  } | null;
}

export interface FocusTrendPoint {
  date: string;
  sessions: number;
  plannedMinutes: number;
  actualMinutes: number;
  averageFocusRating: number | null;
}

export interface FocusDailySummary {
  date: string;
  totalSessions: number;
  totalFocusMinutes: number;
  totalBreakMinutes: number;
  deepWorkSessions: number;
  averageFocusRating: number | null;
  bestSession: FocusSessionListItem | null;
}

export interface FocusStats {
  totalSessions: number;
  totalFocusMinutes: number;
  averageSessionMinutes: number;
  currentStreakDays: number;
  longestStreakDays: number;
  bestSessionFocusMinutes: number;
}

// ============================================================================
// Queries & Filters
// ============================================================================

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface FocusSessionQueryParams {
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  status?: FocusSessionStatus;
  page?: number;
  pageSize?: number;
  sortBy?: 'startedAt' | 'actualDuration' | 'focusRating' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface FocusSessionListResponse {
  success: boolean;
  sessions: FocusSessionListItem[];
  pagination: Pagination;
}

export interface TimeEntryQueryParams {
  startTime?: string;
  endTime?: string;
  projectId?: string;
  goalId?: string;
  habitId?: string;
  billable?: boolean;
  automatic?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductivityPatternQueryParams {
  patternType?: ProductivityPatternType;
  dayOfWeek?: number;
  sortBy?: 'confidence' | 'discoveredAt' | 'lastSeenAt';
  sortOrder?: 'asc' | 'desc';
}

export interface FocusSessionFilterOptions {
  categories: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isFocusSessionWithRelations(session: unknown): session is FocusSessionWithRelations {
  return (
    typeof session === 'object' &&
    session !== null &&
    'id' in session &&
    'title' in session &&
    'breaks' in session
  );
}

export function isBreakType(value: unknown): value is BreakType {
  return (
    typeof value === 'string' &&
    ['SHORT', 'LONG', 'MEAL', 'WALK', 'REST', 'CUSTOM'].includes(value)
  );
}

export function isValidFocusTimerState(state: unknown): state is FocusTimerState {
  return (
    typeof state === 'string' &&
    ['IDLE', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(state)
  );
}

export function getFocusSessionStatus(
  session: Pick<FocusSession, 'startedAt' | 'completedAt' | 'pausedAt'>
): FocusSessionStatus {
  if (session.completedAt) return 'COMPLETED';
  if (session.pausedAt) return 'PAUSED';
  return 'IN_PROGRESS';
}

// ============================================================================
// Utility Types
// ============================================================================

export type FocusSessionsByDate = Record<string, FocusSessionListItem[]>;

export type FocusGroupedByCategory = Record<string, FocusSessionListItem[]>;