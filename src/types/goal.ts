import type {
  Goal,
  Milestone,
  GoalProgress,
  GoalType,
  GoalPriority,
  GoalStatus,
  Project,
  Tag,
} from '@prisma/client';

/**
 * Goal Management Types
 * Complete type system for goal tracking and progress management
 */

// ============================================================================
// Core Goal Types
// ============================================================================

export interface GoalWithRelations extends Goal {
  project: Project | null;
  parentGoal: Goal | null;
  subGoals: Goal[];
  milestones: Milestone[];
  progressLogs: GoalProgress[];
  tags: Array<{ tag: Tag }>;
  _count?: {
    subGoals: number;
    milestones: number;
    progressLogs: number;
  };
}

export interface GoalListItem {
  id: string;
  title: string;
  description: string | null;
  type: GoalType;
  priority: GoalPriority;
  status: GoalStatus;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  progressPercentage: number;
  daysRemaining: number;
  isOverdue: boolean;
  project: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  milestonesCompleted: number;
  milestonesTotal: number;
}

// ============================================================================
// Goal Creation & Update
// ============================================================================

export interface CreateGoalInput {
  title: string;
  description?: string;
  type: GoalType;
  priority?: GoalPriority;
  targetValue: number;
  currentValue?: number;
  unit?: string;
  startDate: Date;
  endDate: Date;
  projectId?: string;
  parentGoalId?: string;
  isPublic?: boolean;
  tagIds?: string[];
  milestones?: Array<{
    title: string;
    description?: string;
    targetValue?: number;
    dueDate?: Date;
  }>;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  type?: GoalType;
  priority?: GoalPriority;
  status?: GoalStatus;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  startDate?: Date;
  endDate?: Date;
  projectId?: string | null;
  parentGoalId?: string | null;
  isPublic?: boolean;
  tagIds?: string[];
}

export interface CreateGoalResponse {
  success: boolean;
  goal?: GoalWithRelations;
  message?: string;
}

export interface UpdateGoalResponse {
  success: boolean;
  goal?: GoalWithRelations;
  message?: string;
}

// ============================================================================
// Goal Progress Tracking
// ============================================================================

export interface UpdateGoalProgressInput {
  goalId: string;
  value: number;
  date?: Date;
  note?: string;
  autoComplete?: boolean; // auto-mark as complete if target reached
}

export interface UpdateGoalProgressResponse {
  success: boolean;
  progress?: GoalProgress;
  goal?: GoalWithRelations;
  completed?: boolean;
  message?: string;
}

export interface BulkUpdateGoalProgressInput {
  updates: Array<{
    goalId: string;
    value: number;
    note?: string;
  }>;
  date?: Date;
}

export interface BulkUpdateGoalProgressResponse {
  success: boolean;
  updated: number;
  failed: number;
  errors?: Array<{
    goalId: string;
    error: string;
  }>;
}

// ============================================================================
// Goal Milestones
// ============================================================================

export interface CreateMilestoneInput {
  goalId: string;
  title: string;
  description?: string;
  targetValue?: number;
  dueDate?: Date;
  sortOrder?: number;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  targetValue?: number;
  dueDate?: Date;
  completedAt?: Date | null;
  sortOrder?: number;
}

export interface CreateMilestoneResponse {
  success: boolean;
  milestone?: Milestone;
  message?: string;
}

export interface CompleteMilestoneInput {
  milestoneId: string;
}

export interface CompleteMilestoneResponse {
  success: boolean;
  milestone?: Milestone;
  goalUpdated?: boolean;
  message?: string;
}

// ============================================================================
// Goal Carry-Over
// ============================================================================

export interface CarryOverGoalInput {
  goalId: string;
  newEndDate: Date;
  newTargetValue?: number;
  reason?: string;
  adjustProgress?: boolean; // carry over current progress or reset
}

export interface CarryOverGoalResponse {
  success: boolean;
  newGoal?: GoalWithRelations;
  originalGoal?: GoalWithRelations;
  message?: string;
}

// ============================================================================
// Goal Analytics
// ============================================================================

export interface GoalAnalytics {
  goalId: string;
  totalProgress: number;
  progressPercentage: number;
  remainingValue: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  isOverdue: boolean;
  velocity: number; // progress per day
  projectedCompletion: Date | null;
  onTrack: boolean;
  requiredDailyProgress: number;
  averageDailyProgress: number;
  bestDay: {
    date: string;
    value: number;
  } | null;
  recentTrend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_DATA';
}

export interface GoalProgressHistory {
  goalId: string;
  entries: Array<{
    date: Date;
    value: number;
    note: string | null;
    cumulativeValue: number;
  }>;
  trendData: Array<{
    date: string;
    actual: number;
    projected: number;
    target: number;
  }>;
}

// ============================================================================
// Goal Queries & Filters
// ============================================================================

export interface GoalQueryParams {
  type?: GoalType | GoalType[];
  status?: GoalStatus | GoalStatus[];
  priority?: GoalPriority | GoalPriority[];
  projectId?: string;
  parentGoalId?: string | null;
  tagId?: string;
  search?: string;
  overdue?: boolean;
  dueSoon?: boolean; // due within next 7 days
  sortBy?: 'title' | 'endDate' | 'priority' | 'progress' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeCompleted?: boolean;
}

export interface GoalFilterOptions {
  types: GoalType[];
  statuses: GoalStatus[];
  priorities: GoalPriority[];
  projects: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

// ============================================================================
// Goal Grouping
// ============================================================================

export interface GoalsByType {
  daily: GoalListItem[];
  weekly: GoalListItem[];
  monthly: GoalListItem[];
  quarterly: GoalListItem[];
  yearly: GoalListItem[];
  custom: GoalListItem[];
}

export interface GoalsByStatus {
  active: GoalListItem[];
  completed: GoalListItem[];
  missed: GoalListItem[];
  carriedOver: GoalListItem[];
  onHold: GoalListItem[];
  cancelled: GoalListItem[];
}

export interface GoalsByPriority {
  critical: GoalListItem[];
  high: GoalListItem[];
  medium: GoalListItem[];
  low: GoalListItem[];
}

// ============================================================================
// Today's Goals
// ============================================================================

export interface TodayGoal {
  id: string;
  title: string;
  description: string | null;
  priority: GoalPriority;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  progressPercentage: number;
  endDate: Date;
  daysRemaining: number;
  isOverdue: boolean;
  requiredTodayProgress: number;
  project: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  todayProgress: number;
  hasProgressToday: boolean;
}

// ============================================================================
// Goal Completion
// ============================================================================

export interface CompleteGoalInput {
  goalId: string;
  completedAt?: Date;
  finalValue?: number;
  note?: string;
}

export interface CompleteGoalResponse {
  success: boolean;
  goal?: GoalWithRelations;
  achievementUnlocked?: boolean;
  message?: string;
}

// ============================================================================
// Goal Health Score
// ============================================================================

export interface GoalHealthScore {
  goalId: string;
  score: number; // 0-100
  status: 'EXCELLENT' | 'GOOD' | 'AT_RISK' | 'CRITICAL';
  factors: {
    progressRate: number;
    timeRemaining: number;
    consistency: number;
    milestoneCompletion: number;
  };
  recommendations: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isGoalWithRelations(goal: unknown): goal is GoalWithRelations {
  return (
    typeof goal === 'object' &&
    goal !== null &&
    'id' in goal &&
    'title' in goal &&
    'type' in goal &&
    'milestones' in goal
  );
}

export function isGoalOverdue(goal: Pick<Goal, 'endDate' | 'status'>): boolean {
  return (
    goal.status === 'ACTIVE' &&
    new Date(goal.endDate) < new Date()
  );
}

export function calculateGoalProgress(
  currentValue: number,
  targetValue: number
): number {
  if (targetValue === 0) return 0;
  return Math.min(100, Math.max(0, (currentValue / targetValue) * 100));
}

// ============================================================================
// Utility Types
// ============================================================================

export type GoalGroupedByProject = Record<string, GoalListItem[]>;

export type GoalCompletionMap = Record<string, boolean>;