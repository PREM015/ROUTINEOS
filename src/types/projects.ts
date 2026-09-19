import type {
  Project,
  Goal,
  Milestone,
  Task,
  TaskDependency,
  Category,
  Tag,
  TimeEntry,
  ProjectStatus,
  GoalPriority,
  TaskStatus,
  TaskPriority,
} from '@prisma/client';

/**
 * Project & Task Management Types
 * Complete type system for projects, tasks, milestones, and dependencies
 */

// ============================================================================
// Core Project Types
// ============================================================================

export interface ProjectWithRelations extends Project {
  category: Category | null;
  goals: Goal[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  _count?: {
    goals: number;
    tasks: number;
    timeEntries: number;
  };
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: GoalPriority;
  color: string | null;
  icon: string | null;
  category: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  startDate: Date | null;
  endDate: Date | null;
  completedAt: Date | null;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  taskCompletionRate: number;
  goalsCount: number;
  goalsCompleted: number;
  totalTimeMinutes: number;
}

// ============================================================================
// Project Creation & Update
// ============================================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: GoalPriority;
  categoryId?: string;
  color?: string;
  icon?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  priority?: GoalPriority;
  categoryId?: string | null;
  color?: string;
  icon?: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface CreateProjectResponse {
  success: boolean;
  project?: ProjectWithRelations;
  message?: string;
}

export interface UpdateProjectResponse {
  success: boolean;
  project?: ProjectWithRelations;
  message?: string;
}

export interface UpdateProjectProgressInput {
  projectId: string;
  progress: number; // 0-100
  note?: string;
}

// ============================================================================
// Project Actions & Status Transitions
// ============================================================================

export type ProjectAction = 'PLAN' | 'ACTIVATE' | 'PAUSE' | 'RESUME' | 'COMPLETE' | 'ARCHIVE' | 'CANCEL';

export interface ChangeProjectStatusInput {
  action: ProjectAction;
  reason?: string;
  completedAt?: Date;
}

export interface ChangeProjectStatusResponse {
  success: boolean;
  project?: ProjectWithRelations;
  message?: string;
}

// ============================================================================
// Core Task Types
// ============================================================================

export interface TaskWithRelations extends Task {
  project: Project | null;
  goal: Goal | null;
  parentTask: Task | null;
  subtasks: Task[];
  dependsOn: TaskDependencyWithTask[];
  blocks: TaskDependencyWithTask[];
  tags: Array<{ tag: Tag }>;
}

export interface TaskDependencyWithTask extends TaskDependency {
  task: Task;
  dependsOn: Task;
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  scheduledFor: Date | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  isUrgent: boolean;
  isImportant: boolean;
  project: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  goal: {
    id: string;
    title: string;
  } | null;
  subtaskCount: number;
  completedSubtaskCount: number;
  dependencyCount: number;
  blocked: boolean;
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  completedAt: Date | null;
}

// ============================================================================
// Task Creation & Update
// ============================================================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  goalId?: string | null;
  parentTaskId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number;
  isUrgent?: boolean;
  isImportant?: boolean;
  tagIds?: string[];
  dependsOnIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  projectId?: string | null;
  goalId?: string | null;
  parentTaskId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  isUrgent?: boolean;
  isImportant?: boolean;
  tagIds?: string[];
}

export interface CreateTaskResponse {
  success: boolean;
  task?: TaskWithRelations;
  message?: string;
}

export interface UpdateTaskResponse {
  success: boolean;
  task?: TaskWithRelations;
  message?: string;
}

// ============================================================================
// Task Dependencies
// ============================================================================

export interface CreateTaskDependencyInput {
  taskId: string;
  dependsOnId: string;
}

export interface RemoveTaskDependencyInput {
  taskId: string;
  dependsOnId: string;
}

export interface CreateTaskDependencyResponse {
  success: boolean;
  dependency?: TaskDependencyWithTask;
  cycleDetected?: boolean;
  message?: string;
}

// ============================================================================
// Eisenhower Matrix
// ============================================================================

export type EisenhowerQuadrant = 'Q1_DO' | 'Q2_SCHEDULE' | 'Q3_DELEGATE' | 'Q4_ELIMINATE';

export interface EisenhowerTask {
  task: TaskListItem;
  quadrant: EisenhowerQuadrant;
}

export interface EisenhowerMatrix {
  q1: EisenhowerTask[];
  q2: EisenhowerTask[];
  q3: EisenhowerTask[];
  q4: EisenhowerTask[];
}

export function getEisenhowerQuadrant(isUrgent: boolean, isImportant: boolean): EisenhowerQuadrant {
  if (isUrgent && isImportant) return 'Q1_DO';
  if (!isUrgent && isImportant) return 'Q2_SCHEDULE';
  if (isUrgent && !isImportant) return 'Q3_DELEGATE';
  return 'Q4_ELIMINATE';
}

// ============================================================================
// Milestones
// ============================================================================

export interface MilestoneWithGoal extends Milestone {
  goal: Pick<Goal, 'id' | 'title' | 'status'>;
}

export interface ProjectMilestoneListItem {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  dueDate: Date | null;
  completedAt: Date | null;
  sortOrder: number;
}

// ============================================================================
// Queries & Pagination
// ============================================================================

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ProjectQueryParams {
  status?: ProjectStatus | ProjectStatus[];
  priority?: GoalPriority | GoalPriority[];
  search?: string;
  categoryId?: string;
  sortBy?: 'name' | 'createdAt' | 'priority' | 'progress' | 'endDate';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
}

export interface ProjectListResponse {
  success: boolean;
  projects: ProjectListItem[];
  pagination: Pagination;
}

export interface TaskQueryParams {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  projectId?: string;
  goalId?: string;
  tagId?: string;
  search?: string;
  dueDate?: string; // YYYY-MM-DD
  dueBefore?: string;
  dueAfter?: string;
  scheduledFor?: string;
  overdue?: boolean;
  upcoming?: boolean;
  parentTaskId?: string | null;
  isSubtask?: boolean;
  isUrgent?: boolean;
  isImportant?: boolean;
  sortBy?: 'dueDate' | 'priority' | 'createdAt' | 'title' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface TaskListResponse {
  success: boolean;
  tasks: TaskListItem[];
  pagination: Pagination;
}

export interface ReorderTasksInput {
  projectId: string;
  taskIds: string[];
}

// ============================================================================
// Project Analytics
// ============================================================================

export interface ProjectAnalytics {
  projectId: string;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    waiting: number;
    overdue: number;
    completionRate: number;
  };
  goals: {
    total: number;
    completed: number;
    active: number;
    completionRate: number;
  };
  time: {
    totalMinutes: number;
    billableMinutes: number;
    averagePerTask: number;
  };
  progressRate: number; // progress points per day
  health: ProjectHealthScore;
}

export interface ProjectHealthScore {
  score: number; // 0-100
  status: 'EXCELLENT' | 'GOOD' | 'AT_RISK' | 'CRITICAL';
  factors: {
    taskCompletion: number;
    goalProgress: number;
    momentum: number;
    timeFocus: number;
  };
  recommendations: string[];
}

export interface ProjectOverview {
  project: ProjectListItem;
  tasks: {
    upcoming: TaskListItem[];
    overdue: TaskListItem[];
    inProgress: TaskListItem[];
  };
  goals: Array<Pick<Goal, 'id' | 'title' | 'status' | 'targetValue' | 'currentValue' | 'endDate' | 'completedAt'>>;
  milestones: ProjectMilestoneListItem[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isProjectWithRelations(project: unknown): project is ProjectWithRelations {
  return (
    typeof project === 'object' &&
    project !== null &&
    'id' in project &&
    'name' in project &&
    'goals' in project &&
    'tasks' in project
  );
}

export function isTaskWithRelations(task: unknown): task is TaskWithRelations {
  return (
    typeof task === 'object' &&
    task !== null &&
    'id' in task &&
    'title' in task &&
    'subtasks' in task
  );
}

export function isEisenhowerQuadrant(value: unknown): value is EisenhowerQuadrant {
  return (
    typeof value === 'string' &&
    ['Q1_DO', 'Q2_SCHEDULE', 'Q3_DELEGATE', 'Q4_ELIMINATE'].includes(value)
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type ProjectsByStatus = Record<ProjectStatus, ProjectListItem[]>;

export type TasksByStatus = Record<TaskStatus, TaskListItem[]>;

export type TasksByQuadrant = Record<EisenhowerQuadrant, TaskListItem[]>;